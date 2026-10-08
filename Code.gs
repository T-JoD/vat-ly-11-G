/**
 * HỆ THỐNG BACKEND GOOGLE APPS SCRIPT
 * Chuẩn hóa theo quy ước bộ skill học tập (13 tab Google Sheet)
 * Bản cập nhật: Hỗ trợ chấm Đúng/Sai từng ý nhỏ, thống kê chi tiết độ tự tin
 */

const SHEET_CAU_HINH = "CauHinh";
const SHEET_HOC_SINH = "HocSinh";
const SHEET_NGAN_HANG = "NganHangDe";
const SHEET_DE_KIEM_TRA = "DeKiemTra";
const SHEET_LICH = "LichKiemTra";
const SHEET_NGOAI_LE = "NgoaiLe";
const SHEET_LUOT_LAM = "LuotLam";
const SHEET_KET_QUA = "KetQua";
const SHEET_BAN_NHAP = "BanNhap";
const SHEET_MUC_KIEN_THUC = "MucKienThuc";

function responseJSON(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetToObjects(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function doGet(e) {
  const action = (e && e.parameter) ? e.parameter.action : null;
  if (!action) {
    return responseJSON({
      status: "ok",
      message: "Hệ thống API Google Apps Script cho 13 tab Google Sheets đang hoạt động bình thường."
    });
  }

  let result = { status: "error", message: "Hành động không hợp lệ" };
  try {
    switch (action) {
      case "lich":
        result = lay_lich();
        break;
      case "luyen_tap_lay":
        result = luyen_tap_lay(e.parameter.buoi, e.parameter.the);
        break;
      default:
        result = { status: "error", message: "Action GET không được hỗ trợ" };
    }
  } catch (err) {
    result = { status: "error", message: err.toString() };
  }
  return responseJSON(result);
}

function doPost(e) {
  let result = { status: "error", message: "Yêu cầu không hợp lệ" };
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    switch (action) {
      case "kiem_tra_ma":
        result = kiem_tra_ma(contents.ma_hs);
        break;
      case "bat_dau":
        result = bat_dau(contents.ma_hs, contents.ma_bai || contents.ma_kiem_tra);
        break;
      case "luu_nhap":
        result = luu_nhap(contents.id_luot || contents.ma_luot_lam, contents.du_lieu_nhap);
        break;
      case "nop":
        result = nop(contents.id_luot || contents.ma_luot_lam, contents.dap_an_hs);
        break;
      default:
        result = { status: "error", message: "Action POST không được hỗ trợ" };
    }
  } catch (err) {
    result = { status: "error", message: err.toString() };
  }
  return responseJSON(result);
}

function kiem_tra_ma(maHS) {
  if (!maHS) return { status: "error", message: "Vui lòng nhập mã học sinh!" };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_HOC_SINH);
  if (!sheet) return { status: "error", message: "Không tìm thấy tab HocSinh!" };
  
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === String(maHS).trim().toUpperCase()) {
      const trangThai = String(data[i][4] || "hoat_dong").toLowerCase();
      const khoaDen = data[i][5] ? new Date(data[i][5]) : null;
      
      if (trangThai === "khoa" || (khoaDen && khoaDen > now)) {
        const phutConLai = khoaDen ? Math.ceil((khoaDen - now) / 60000) : 10;
        return { status: "locked", message: `Tài khoản tạm thời bị khóa. Vui lòng thử lại sau ${phutConLai} phút.` };
      }
      return { 
        status: "success", 
        ma_hs: data[i][0], 
        ten_hien_thi: data[i][1], 
        nhom: data[i][2],
        vai_tro: data[i][3] || "hoc_sinh"
      };
    }
  }
  return { status: "error", message: "Mã học sinh không tồn tại trên hệ thống!" };
}

function lay_lich() {
  const lichArr = sheetToObjects(SHEET_LICH);
  const now = new Date();
  const ds = lichArr.map(item => {
    let trangThai = "DANG_MO";
    if (item.gio_mo && item.gio_dong) {
      const mo = new Date(item.gio_mo);
      const dong = new Date(item.gio_dong);
      if (now < mo) trangThai = "SAP_MO";
      else if (now > dong) trangThai = "DA_DONG";
    }
    return {
      ma_bai: item.ma_bai,
      nhom: item.nhom,
      loai_bai: item.loai_bai,
      gio_mo: item.gio_mo,
      gio_dong: item.gio_dong,
      thoi_luong_phut: item.thoi_luong_phut,
      trang_thai: trangThai,
      cho_phep_khong_biet: item.cho_phep_khong_biet === true || item.cho_phep_khong_biet === "true"
    };
  });
  return { status: "success", data: ds };
}

function bat_dau(maHS, maBai) {
  const xacthuc = kiem_tra_ma(maHS);
  if (xacthuc.status !== "success") return xacthuc;

  const lichList = sheetToObjects(SHEET_LICH);
  const bai = lichList.find(b => String(b.ma_bai) === String(maBai));
  if (!bai) return { status: "error", message: "Bài kiểm tra không tồn tại!" };

  const now = new Date();
  if (bai.gio_mo && bai.gio_dong && xacthuc.vai_tro !== "giang_vien") {
    const mo = new Date(bai.gio_mo);
    const dong = new Date(bai.gio_dong);
    if (now < mo || now > dong) {
      return { status: "error", message: "Hiện không trong khung giờ mở của bài kiểm tra này!" };
    }
  }

  // Lấy danh sách câu hỏi
  const deKiemTraList = sheetToObjects(SHEET_DE_KIEM_TRA);
  let maCaus = deKiemTraList
    .filter(d => String(d.ma_bai) === String(maBai) && (!d.ma_hs || String(d.ma_hs) === String(maHS)))
    .map(d => String(d.ma_cau));

  const nganHang = sheetToObjects(SHEET_NGAN_HANG);
  let questions = [];
  if (maCaus.length > 0) {
    questions = nganHang.filter(q => maCaus.includes(String(q.ma_cau)));
  } else {
    questions = nganHang.filter(q => String(q.bai_gan) === String(maBai) || String(q.buoi) === String(maBai));
  }

  const dsCauHoi = questions.map(q => ({
    ma_cau: q.ma_cau,
    loai: q.loai,
    de: q.de,
    lua_chon: q.lua_chon,
    hinh: q.hinh
  }));

  const idLuot = "LL_" + now.getTime() + "_" + Math.floor(Math.random() * 1000);
  const sheetLuotLam = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LUOT_LAM);
  if (sheetLuotLam) {
    sheetLuotLam.appendRow([
      idLuot, maHS, xacthuc.nhom || "", maBai, 
      (xacthuc.vai_tro === "giang_vien" ? "giang_vien" : "kiem_tra"),
      now, "", "dang_lam", 0, 0, 0, 0, dsCauHoi.length
    ]);
  }

  return {
    status: "success",
    id_luot: idLuot,
    ma_luot_lam: idLuot,
    thoi_luong_phut: bai.thoi_luong_phut || 45,
    cho_phep_khong_biet: bai.cho_phep_khong_biet === true || bai.cho_phep_khong_biet === "true",
    danh_sach_cau_hoi: dsCauHoi
  };
}

function luu_nhap(idLuot, duLieuNhap) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BAN_NHAP);
  if (!sheet) return { status: "error", message: "Tab BanNhap không tồn tại!" };
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const strData = JSON.stringify(duLieuNhap);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idLuot)) {
      sheet.getRange(i + 1, 2).setValue(strData);
      sheet.getRange(i + 1, 3).setValue(now);
      return { status: "success", message: "Đã lưu bản nháp" };
    }
  }
  sheet.appendRow([idLuot, strData, now]);
  return { status: "success", message: "Đã tạo bản nháp mới" };
}

function nop(idLuot, dapAnHS) {
  const sheetLuot = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LUOT_LAM);
  const luotData = sheetLuot.getDataRange().getValues();
  let rowIdx = -1;
  let maHS = "", maBai = "", nhan = "kiem_tra";

  for (let i = 1; i < luotData.length; i++) {
    if (String(luotData[i][0]) === String(idLuot)) {
      rowIdx = i + 1;
      maHS = luotData[i][1];
      maBai = luotData[i][3];
      nhan = luotData[i][4];
      if (luotData[i][7] === "da_nop") {
        return { status: "error", message: "Lượt làm này đã được nộp trước đó!" };
      }
      break;
    }
  }
  if (rowIdx === -1) return { status: "error", message: "Không tìm thấy mã lượt làm!" };

  const nganHang = sheetToObjects(SHEET_NGAN_HANG);
  let tongDiemTuTin = 0;
  let soY = 0;
  let soYDung = 0;
  const now = new Date();
  const sheetKetQua = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_KET_QUA);

  // Thống kê chi tiết
  const stats = {
    chac_chan: { tong: 0, dung: 0, sai: 0 },
    kha_chac: { tong: 0, dung: 0, sai: 0 },
    khong_chac: { tong: 0, dung: 0, sai: 0 },
    khong_biet: { tong: 0 },
    bo_qua: { tong: 0 }
  };

  (dapAnHS || []).forEach(item => {
    const rawMaCau = String(item.ma_cau_goc || item.ma_cau || item.ma_cau_hoi);
    const q = nganHang.find(cau => String(cau.ma_cau) === rawMaCau);
    if (!q) return;

    soY++;
    let isCorrect = false;
    let luaChon = String(item.tra_loi || item.lua_chon || "").trim();

    // 1. Kiểm tra trường hợp bỏ qua câu (không làm)
    if (!luaChon && !item.do_tu_tin && !item.khong_biet) {
      stats.bo_qua.tong++;
      if (sheetKetQua) {
        sheetKetQua.appendRow([
          idLuot, maHS, maBai, nhan, item.ma_cau, q.phien_ban || 1, 1, 
          "", "BO_QUA", 0, 0, q.ma_the_chinh || "", now
        ]);
      }
      return;
    }

    // 2. Chấm điểm đúng / sai
    if (item.loai === 'dung_sai_y' && item.sub_key) {
      // Đúng/Sai theo từng ý
      const subIdx = ['a', 'b', 'c', 'd'].indexOf(item.sub_key);
      const dapAnParts = String(q.dap_an || "").split(',');
      const dapAnChuan = (subIdx >= 0 && subIdx < dapAnParts.length) ? dapAnParts[subIdx].trim().toUpperCase() : "";
      isCorrect = (luaChon.toUpperCase() === dapAnChuan);
    } else if (q.loai === "dien_dap") {
      let tol = 0.05;
      try {
        const conf = JSON.parse(q.dap_an_chap_nhan);
        if (conf.dung_sai) tol = conf.dung_sai;
      } catch(e){}
      let valHS = parseFloat(luaChon.replace(',', '.'));
      let valChuan = parseFloat(String(q.dap_an || "").replace(',', '.'));
      isCorrect = !isNaN(valHS) && !isNaN(valChuan) && Math.abs(valHS - valChuan) <= tol;
    } else if (q.loai === "nhieu_dap_an") {
      const arrHS = luaChon.split(',').map(s => s.trim().toUpperCase()).sort().join(',');
      const arrChuan = String(q.dap_an || "").split(',').map(s => s.trim().toUpperCase()).sort().join(',');
      isCorrect = (arrHS === arrChuan);
    } else {
      isCorrect = (luaChon.toUpperCase() === String(q.dap_an || "").trim().toUpperCase());
    }

    if (isCorrect) soYDung++;

    // 3. Tính điểm độ tự tin
    let diemTT = 0;
    if (item.khong_biet) {
      diemTT = 0;
      stats.khong_biet.tong++;
    } else {
      const dt = String(item.do_tu_tin || "").toLowerCase();
      if (dt.includes("chắc chắn") || dt.includes("chac_chan")) {
        diemTT = isCorrect ? 1.0 : -1.5;
        stats.chac_chan.tong++;
        if (isCorrect) stats.chac_chan.dung++;
        else stats.chac_chan.sai++;
      } else if (dt.includes("khá chắc") || dt.includes("kha_chac")) {
        diemTT = isCorrect ? 0.6 : -0.6;
        stats.kha_chac.tong++;
        if (isCorrect) stats.kha_chac.dung++;
        else stats.kha_chac.sai++;
      } else if (dt.includes("không chắc") || dt.includes("khong_chac")) {
        diemTT = isCorrect ? 0.3 : -0.3;
        stats.khong_chac.tong++;
        if (isCorrect) stats.khong_chac.dung++;
        else stats.khong_chac.sai++;
      }
    }
    tongDiemTuTin += diemTT;

    if (sheetKetQua) {
      sheetKetQua.appendRow([
        idLuot, maHS, maBai, nhan, item.ma_cau, q.phien_ban || 1, 1, 
        luaChon, item.do_tu_tin || "", isCorrect ? 1 : 0, diemTT, q.ma_the_chinh || "", now
      ]);
    }
  });

  const diemDungSai = soY > 0 ? Math.round((soYDung / soY) * 10 * 100) / 100 : 0;
  tongDiemTuTin = Math.round(tongDiemTuTin * 10) / 10;
  const tuTinMin = -1.5 * soY;
  const tuTinMax = 1.0 * soY;

  sheetLuot.getRange(rowIdx, 6).setValue(now);
  sheetLuot.getRange(rowIdx, 8).setValue("da_nop");
  sheetLuot.getRange(rowIdx, 9).setValue(diemDungSai);
  sheetLuot.getRange(rowIdx, 10).setValue(tongDiemTuTin);
  sheetLuot.getRange(rowIdx, 11).setValue(tuTinMin);
  sheetLuot.getRange(rowIdx, 12).setValue(tuTinMax);

  return {
    status: "success",
    diem_dung_sai: diemDungSai,
    diem_so: diemDungSai,
    diem_tu_tin: tongDiemTuTin,
    tu_tin_min: tuTinMin,
    tu_tin_max: tuTinMax,
    so_y: soY,
    so_y_dung: soYDung,
    chi_tiet_tu_tin: stats
  };
}

function luyen_tap_lay(buoi, the) {
  const nganHang = sheetToObjects(SHEET_NGAN_HANG);
  let ds = nganHang.filter(q => q.trang_thai === "san_sang" && (!q.bai_gan || String(q.bai_gan).trim() === ""));
  if (buoi) ds = ds.filter(q => String(q.buoi) === String(buoi));
  if (the) ds = ds.filter(q => String(q.ma_the_chinh) === String(the));

  return {
    status: "success",
    data: ds.map(q => ({
      ma_cau: q.ma_cau,
      loai: q.loai,
      de: q.de,
      lua_chon: q.lua_chon,
      dap_an: q.dap_an,
      loi_giai: q.loi_giai
    }))
  };
}
