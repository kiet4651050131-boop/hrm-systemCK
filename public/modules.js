/* Giao diện các module: Tổng quan, Chấm công, Nghỉ phép, Lương, Cấu hình.
   Dùng các hàm chung của index.html: $, esc, api, modal, fail, mng, render, me, ROLES */
var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
var thisMonth = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); };
var DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
var dmy = function (s) { return s ? s.slice(8) + '/' + s.slice(5, 7) : ''; };
var attM = thisMonth(), attEmp = null, attQ = '', attDept = '', attPage = 1, lvS = '', leaveQ = '', leaveMonth = '', leaveDept = '', leavePage = 1,
  otQ = '', otMonth = '', otDept = '', otPage = 1, empPage = 1, payTab = 'periods', payOpen = null, payMonth = '', slips = [];

function resetViews() { attEmp = null; payOpen = null; }
function kpi(label, val, sub, icon) { return '<div class="kpi"><span class="ki">' + ico(icon || 'doc') + '</span><div class="v">' + val + '</div><small>' + label + '</small>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
function doughnutChart(data,total){
 var colors=['var(--ok)','var(--wa)','var(--pri)','var(--bd)'],sum=data.reduce(function(s,x){return s+x.value},0),at=0;
 var stops=data.map(function(item,i){var start=at;at+=sum?item.value/sum*100:0;return colors[i]+' '+start+'% '+at+'%'}).join(',');
 return '<div class="donut-wrap"><div class="donut" role="img" aria-label="Tình hình chấm công hôm nay" style="background:'+(sum?'conic-gradient('+stops+')':'var(--bd)')+'"><div class="donut-center">'+total+'<small>nhân sự</small></div></div><div class="donut-legend">'+data.map(function(item,i){return '<span><i class="legend-dot" style="background:'+colors[i]+'"></i>'+esc(item.name)+'<b>'+item.value+'</b></span>'}).join('')+'</div></div>';
}
function payrollColumns(data){
 var max=Math.max.apply(null,data.map(function(item){return Number(item.net)||0}).concat([1]));
 return '<div class="columns" role="img" aria-label="Biến động quỹ lương thực nhận">'+data.map(function(item){var value=Number(item.net)||0;return '<div class="column" title="'+esc(item.month)+': '+fmt(value)+'"><b>'+fmt(value)+'</b><i style="height:'+Math.max(3,Math.round(value/max*100))+'%"></i><span>'+esc(item.month.slice(5))+'</span></div>'}).join('')+'</div>';
}
function stTag(s) {
  var c = { 'Đã duyệt': 't-ok', 'Chờ quản lý': 't-wa', 'Chờ HR': 't-wa', 'Từ chối': 't-bad', 'Đã hủy': 't-off', 'Đã chốt': 't-ok', 'Nháp': 't-wa' }[s];
  return '<span class="tag ' + (c || '') + '">' + esc(s) + '</span>';
}
function bars(list, fmtVal) {
  var max = Math.max.apply(null, list.map(function (x) { return x.v; }).concat([1]));
  return list.map(function (x) {
    return '<div class="brow"><span class="bl">' + esc(x.n) + '</span><span class="trk"><i style="width:' + Math.max(3, Math.round(x.v / max * 100)) + '%"></i></span><b>' + (fmtVal ? fmtVal(x.v) : x.v) + '</b></div>';
  }).join('');
}

/* ================= TỔNG QUAN ================= */
async function vDash() {
  var d = await api('/dashboard'), h = '';
  var supplemental = me.role === 'employee'
    ? await api('/attendance/month?month=' + thisMonth())
    : await Promise.all([api('/leave'), api('/overtime')]);
  var now = new Date(), hr = now.getHours();
  var hello = hr < 11 ? 'Chào buổi sáng' : hr < 14 ? 'Chào buổi trưa' : hr < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  var dowName = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][now.getDay()];
  var sub = dowName + ', ' + dmy(d.today) + '/' + d.today.slice(0, 4) + (d.pending_for_me ? '. Có ' + d.pending_for_me + ' đơn nghỉ đang chờ bạn duyệt' : '');
  var chk = '';
  if (d.my_today) {
    var t = d.my_today;
    chk = '<div class="chk"><div><small>' + ico('clock') + 'Chấm công hôm nay</small><b>' +
      (t.check_in ? 'Vào ' + t.check_in + (t.check_out ? ' · Ra ' + t.check_out : '') : 'Chưa check-in') + '</b></div>' +
      (!t.check_in ? '<button class="btn acc" onclick="doCheck(\'check-in\')">Check-in</button>'
        : !t.check_out ? '<button class="btn acc" onclick="doCheck(\'check-out\')">Check-out</button>' : '<span class="tag t-ok">Đã xong hôm nay</span>') + '</div>';
  }
  h += '<div class="hero"><div><h1>' + hello + ', ' + esc(me.name.trim().split(/\s+/).pop()) + '</h1><p>' + esc(sub) + '</p>' + (chk || '') + '</div></div>';
  var k = '';
  if (d.headcount !== undefined) {
    k += kpi('Nhân sự', d.headcount, '', 'people') + kpi('Đi làm hôm nay', d.present_today, '', 'check') + kpi('Nghỉ phép hôm nay', d.on_leave_today, '', 'leave') + kpi('Mới vào 30 ngày', d.new_hires_30d, '', 'spark');
  }
  if (d.pending_for_me !== undefined) k += kpi('Đơn chờ tôi duyệt', d.pending_for_me, '', 'doc');
  if (d.my_leave) k += kpi('Phép năm còn lại', d.my_leave.remaining, 'đã dùng ' + d.my_leave.used + ' / ' + d.my_leave.quota, 'leave') + kpi('Đơn của tôi đang chờ', d.my_pending, '', 'hourglass');
  if (k) h += '<div class="kpis">' + k + '</div>';
  if(me.role==='employee'&&d.my_leave){
    var monthSummary=supplemental[0]||{}, credited=Number(monthSummary.present||0)+Number(monthSummary.paid_leave||0), standard=Number(monthSummary.std_days||0);
    var progress=standard?Math.min(100,Math.round(credited/standard*100)):0;
    h+='<div class="dash-grid"><section class="dash-panel"><h2>Chấm công tháng '+thisMonth()+'</h2>'+
      '<div class="mut">'+credited+' / '+standard+' ngày công được ghi nhận</div><div class="dash-progress"><i style="width:'+progress+'%"></i></div>'+
      '<div class="dash-stats"><div class="dash-stat"><b>'+Number(monthSummary.present||0)+'</b><small>Ngày đi làm</small></div>'+
      '<div class="dash-stat"><b>'+Number(monthSummary.paid_leave||0)+'</b><small>Nghỉ có lương</small></div>'+
      '<div class="dash-stat"><b>'+Number(monthSummary.absent||0)+'</b><small>Ngày vắng</small></div></div></section>'+
      '<section class="dash-panel"><h2>Lối tắt</h2><div class="dash-shortcuts">'+
      '<button class="dash-shortcut" onclick="go(&quot;att&quot;)">'+ico('clock')+'Bảng công</button>'+
      '<button class="dash-shortcut" onclick="go(&quot;leave&quot;)">'+ico('leave')+'Đơn nghỉ phép</button>'+
      '<button class="dash-shortcut" onclick="go(&quot;overtime&quot;)">'+ico('clock')+'Đề nghị tăng ca</button>'+
      '<button class="dash-shortcut" onclick="go(&quot;pay&quot;)">'+ico('pay')+'Phiếu lương</button></div></section></div>';
  }else if(me.role!=='employee'){
    var pendingLeave=supplemental[0].filter(function(row){return row.can_decide}).map(function(row){return{type:'Nghỉ phép',name:row.name,description:row.from_date+(row.to_date!==row.from_date?' → '+row.to_date:''),href:'leave',date:row.from_date}});
    var pendingOvertime=supplemental[1].filter(function(row){return row.can_decide}).map(function(row){return{type:'Tăng ca',name:row.name,description:row.date+' · '+row.hours+' giờ',href:'overtime',date:row.date}});
    var pendingRows=pendingLeave.concat(pendingOvertime).sort(function(a,b){return a.date.localeCompare(b.date)}).slice(0,5);
    var pendingCount=pendingLeave.length+pendingOvertime.length;
    h+='<div class="dash-grid"><section class="dash-panel"><h2>Cần bạn xử lý <span class="mut">('+pendingCount+(pendingCount>=500?'+':'')+')</span></h2>'+
      (pendingRows.length?'<div class="dash-list">'+pendingRows.map(function(row){return'<div class="dash-row"><div class="dash-row-main"><b>'+esc(row.type)+' · '+esc(row.name)+'</b><small>'+esc(row.description)+'</small></div><button class="btn g s" onclick="go(&quot;'+row.href+'&quot;)">Mở</button></div>'}).join('')+'</div>':'<p class="mut">Hiện không có đơn nghỉ hoặc tăng ca cần bạn duyệt.</p>')+
      '</section><section class="dash-panel"><h2>Truy cập nhanh</h2><div class="dash-shortcuts">'+
      '<button class="dash-shortcut" onclick="go(&quot;att&quot;)">'+ico('clock')+'Bảng chấm công</button>'+
      '<button class="dash-shortcut" onclick="go(&quot;leave&quot;)">'+ico('leave')+'Đơn nghỉ phép</button>'+
      '<button class="dash-shortcut" onclick="go(&quot;overtime&quot;)">'+ico('clock')+'Đơn tăng ca</button>'+
      '<button class="dash-shortcut" onclick="go(&quot;emps&quot;)">'+ico('people')+'Hồ sơ nhân viên</button></div></section></div>';
  }
  if (d.by_department && d.by_department.length) {
    h += '<div class="grid"><div class="card"><h2>Nhân sự theo phòng ban</h2>' + bars(d.by_department.map(function (x) { return { n: x.name, v: x.count }; })) + '</div>' +
      '<div class="card"><h2>Theo trạng thái</h2>' + bars(d.by_status.map(function (x) { return { n: x.name, v: x.count }; })) + '</div></div>';
  }
  if(d.headcount!==undefined){
    var late=Number(d.late_today||0),present=Number(d.present_today||0),leave=Number(d.on_leave_today||0);
    var onTime=Math.max(0,present-late),notRecorded=Math.max(0,Number(d.headcount)-onTime-late-leave);
    h+='<div class="card"><h2>Tình hình chấm công hôm nay</h2>'+doughnutChart([
      {name:'Đi làm đúng giờ',value:onTime},{name:'Đi muộn',value:late},{name:'Nghỉ phép',value:leave},{name:'Chưa ghi nhận',value:notRecorded}
    ],d.headcount)+'</div>';
  }
  if (d.payroll_trend && d.payroll_trend.length) {
    h += '<div class="card"><h2>Quỹ lương thực nhận (các kỳ đã chốt)</h2>' + payrollColumns(d.payroll_trend) + '</div>';
  }
  $('v').innerHTML = h || '<p class="mut">Chưa có dữ liệu.</p>';
}
async function doCheck(k) { try { await api('/attendance/' + k, 'POST'); toast(k==='check-in'?'Đã check-in thành công':'Đã check-out thành công','success'); render(); } catch (e) { fail(e); } }

/* ================= CHẤM CÔNG ================= */
async function vAtt() {
  var h = '<div class="bar"><input type="month" style="width:auto;flex:none" value="' + attM + '" onchange="if(this.value){attM=this.value;attEmp=null;attPage=1;render()}">' +
    (!attEmp ? '<input id="attSearch" placeholder="Tìm tên, mã nhân viên hoặc phòng ban..." value="' + esc(attQ) + '" oninput="filterRender(\'attSearch\',\'attQ\',\'attPage\')">' : '') +
    (!attEmp&&me.role!=='employee'?'<select style="width:auto" onchange="attDept=this.value;attPage=1;render()"><option value="">Tất cả phòng ban</option>'+depts.map(function(d){return '<option value="'+d.id+'"'+(String(d.id)===attDept?' selected':'')+'>'+esc(d.name)+'</option>'}).join('')+'</select>':'')+
    '<button class="btn g" onclick="downloadCsv(\'/attendance/export?month=' + attM + (attDept?'&department_id='+encodeURIComponent(attDept):'') + '\').catch(fail)">Xuất CSV</button>' +
    (mng() ? '<button class="btn g" onclick="attImp()">Import file chấm công</button>' : '') + '</div>';
  var l = [];
  if (!attEmp) {
    l = await api('/attendance/month?month=' + attM + (attDept?'&department_id='+encodeURIComponent(attDept):''));
    if (me.role === 'employee' && l.length === 1) attEmp = l[0].employee_id;
  }
  if (attEmp) {
    var r = await api('/attendance/month/' + attEmp + '?month=' + attM), s = r.summary;
    h += '<div class="card"><h2>' + esc(r.employee.name) + ' <span class="mut">(' + esc(r.employee.code) + ') · tháng ' + attM.slice(5) + '/' + attM.slice(0, 4) + '</span></h2>' +
      '<div class="kpis">' + kpi('Công chuẩn', s.std_days, '', 'logs') + kpi('Đi làm', s.present, '', 'check') + kpi('Nghỉ phép', s.paid_leave, '', 'leave') + kpi('Nghỉ không lương', s.unpaid_leave, '', 'sun') + kpi('Vắng', s.absent, '', 'doc') + kpi('Đi muộn', s.late, '', 'clock') + '</div>' +
      (me.role !== 'employee' ? '<button class="btn g s" onclick="attEmp=null;render()">← Danh sách</button>' : '') +
      '<div class="tw" style="margin-top:10px"><table><tr><th>Ngày</th><th>Giờ vào</th><th>Giờ ra</th><th>Số giờ</th><th>Trạng thái</th><th></th></tr>' +
      r.days.map(function (x) {
        var cls = /Vắng/.test(x.status) ? 't-bad' : /muộn|Thiếu/.test(x.status) ? 't-wa' : x.status === 'Đi làm' ? 't-ok' : '';
        return '<tr' + (x.workday ? '' : ' class="dim"') + '><td>' + DOW[x.dow] + ' ' + dmy(x.date) + '</td><td>' + (x.check_in || '') + '</td><td>' + (x.check_out || '') + '</td><td>' + (x.hours != null ? x.hours.toFixed(1) : '') +
          '</td><td>' + (x.status ? '<span class="tag ' + cls + '">' + esc(x.status) + '</span>' : '') + (x.note ? ' <span class="mut">' + esc(x.note) + '</span>' : '') + '</td><td>' +
          (mng() ? '<button class="btn g s" onclick="attEdit(' + r.employee.id + ',\'' + x.date + '\',\'' + (x.check_in || '') + '\',\'' + (x.check_out || '') + '\')">Sửa</button>' : '') + '</td></tr>';
      }).join('') + '</table></div></div>';
  } else {
    var filtered = l.filter(function (row) {
      var query = attQ.trim().toLocaleLowerCase('vi');
      return !query || [row.name, row.code, row.department].some(function (value) { return String(value || '').toLocaleLowerCase('vi').indexOf(query) >= 0; });
    });
    var page = pageData(filtered, attPage, 12);attPage=page.page;
    h += '<div class="card tw"><table><tr><th>Mã</th><th>Họ tên</th><th>Phòng ban</th><th>Công chuẩn</th><th>Đi làm</th><th>Nghỉ phép</th><th>Nghỉ KL</th><th>Vắng</th><th>Đi muộn</th><th></th></tr>' +
      page.items.map(function (x) {
        return '<tr><td class="mut">' + esc(x.code) + '</td><td><div class="who">' + avatar(x.name) + '<b>' + esc(x.name) + '</b></div></td><td>' + esc(x.department || '-') + '</td><td>' + x.std_days + '</td><td>' + x.present + '</td><td>' + x.paid_leave + '</td><td>' + x.unpaid_leave + '</td><td>' +
          (x.absent ? '<span class="tag t-bad">' + x.absent + '</span>' : 0) + '</td><td>' + x.late + '</td><td><button class="btn g s" onclick="attEmp=' + x.employee_id + ';render()">Chi tiết</button></td></tr>';
      }).join('') + (filtered.length ? '' : '<tr><td colspan="10" class="empty">Không tìm thấy nhân viên phù hợp với bộ lọc.</td></tr>') + '</table>' + pageBar(page.page,page.count,page.total,'attendance') + '</div>' +
      '<p class="mut">Quy ước: đi làm từ 4 giờ trở lên = 1 công, dưới 4 giờ = 0,5 công. Ngày hôm nay chưa tính vắng.</p>';
  }
  $('v').innerHTML = h;
}
function attEdit(id, date, ci, co) {
  modal('Sửa công ngày ' + dmy(date) + '/' + date.slice(0, 4), [['check_in', 'Giờ vào', 'time'], ['check_out', 'Giờ ra', 'time'], ['note', 'Ghi chú']], { check_in: ci, check_out: co }, async function (v) {
    await api('/attendance', 'PUT', { employee_id: id, date: date, check_in: v.check_in, check_out: v.check_out, note: v.note });
  }, '<p class="mut">Để trống cả giờ vào và giờ ra để xóa dữ liệu ngày này.</p>');
}
function attImp() {
  modal('Import dữ liệu máy chấm công', [['csv', 'Dán dữ liệu, mỗi dòng một lượt chấm', 'area']], {}, async function (v) {
    var r = await api('/attendance/import', 'POST', { csv: v.csv });
    if (!r.errors.length) return null;
    return '+Đã nhập ' + r.imported + ' dòng. Dòng lỗi: ' + r.errors.slice(0, 6).join('; ');
  }, '<p class="mut">Cột: mã nhân viên, ngày, giờ vào, giờ ra<br>Ví dụ: NV010, 15/10/2026, 08:05, 17:32<br>Ngày dạng DD/MM/YYYY hoặc YYYY-MM-DD. Dữ liệu trùng ngày sẽ được ghi đè.</p>', 'Import');
}

/* ================= NGHỈ PHÉP ================= */
async function vLeave() {
  var res = await Promise.all([api('/leave/types'), api('/leave/balance').catch(function () { return null; }), api('/leave?status=' + encodeURIComponent(lvS))]);
  var types = res[0], bal = res[1], list = res[2], h = '';
  if (bal) {
    h += '<div class="kpis">' + kpi('Phép năm ' + bal.year, bal.quota, 'tổng số ngày', 'logs') + kpi('Đã nghỉ', bal.used, '', 'sun') + kpi('Đang chờ duyệt', bal.pending, '', 'hourglass') + kpi('Còn lại', bal.remaining, '', 'leave') + '</div>';
  }
  h += '<div class="bar"><input id="leaveSearch" placeholder="Tìm tên hoặc mã nhân viên..." value="' + esc(leaveQ) + '" oninput="filterRender(\'leaveSearch\',\'leaveQ\',\'leavePage\')">' +
    '<input type="month" style="width:auto;flex:none" value="' + esc(leaveMonth) + '" onchange="leaveMonth=this.value;leavePage=1;render()">' +
    (me.role==='employee'?'':'<select style="width:auto" onchange="leaveDept=this.value;leavePage=1;render()"><option value="">Tất cả phòng ban</option>'+depts.map(function(d){return '<option value="'+d.id+'"'+(String(d.id)===leaveDept?' selected':'')+'>'+esc(d.name)+'</option>'}).join('')+'</select>') +
    '<select style="width:auto" onchange="lvS=this.value;leavePage=1;render()"><option value="">Tất cả trạng thái</option>' +
    ['Chờ quản lý', 'Chờ HR', 'Đã duyệt', 'Từ chối', 'Đã hủy'].map(function (s) { return '<option' + (s === lvS ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
    '<span class="sp"></span><button class="btn" onclick="lvNew()">+ Tạo đơn nghỉ</button></div>';
  window._types = types;
  var showWho = me.role !== 'employee';
  var filtered=list.filter(function(row){
    var query=leaveQ.trim().toLocaleLowerCase('vi');
    var matchesQuery=!query||[row.name,row.code].some(function(value){return String(value||'').toLocaleLowerCase('vi').indexOf(query)>=0});
    var matchesMonth=!leaveMonth||(row.from_date<=leaveMonth+'-31'&&row.to_date>=leaveMonth+'-01');
    return matchesQuery&&matchesMonth&&(!leaveDept||String(row.department_id)===leaveDept);
  });
  var page=pageData(filtered,leavePage,10);leavePage=page.page;
  h += '<div class="card tw"><table><tr>' + (showWho ? '<th>Nhân viên</th>' : '') + '<th>Loại</th><th>Thời gian</th><th>Số ngày</th><th>Lý do</th><th>Trạng thái</th><th></th></tr>' +
    page.items.map(function (r) {
      return '<tr>' + (showWho ? '<td><div class="who">' + avatar(r.name) + '<div><b>' + esc(r.name) + '</b><span class="mut">' + esc(r.department || '') + '</span></div></div></td>' : '') + '<td>' + esc(r.type) + '</td><td style="white-space:nowrap">' +
        dmy(r.from_date) + (r.to_date !== r.from_date ? ' → ' + dmy(r.to_date) : '') + '/' + r.from_date.slice(0, 4) + (r.half ? ' (nửa ngày)' : '') + '</td><td>' + r.days + '</td><td>' + esc(r.reason) +
        (r.manager_note ? '<div class="mut">Phản hồi: ' + esc(r.manager_note) + '</div>' : '') + '</td><td>' + stTag(r.status) + '</td><td style="white-space:nowrap">' +
        (r.can_decide ? '<button class="btn s" onclick="lvOk(' + r.id + ')">Duyệt</button> <button class="btn r s" onclick="lvNo(' + r.id + ')">Từ chối</button> ' : '') +
        (r.can_cancel ? '<button class="btn g s" onclick="lvCancel(' + r.id + ')">Hủy đơn</button>' : '') + '</td></tr>';
    }).join('') + (filtered.length ? '' : '<tr><td colspan="7" class="empty">Không tìm thấy đơn nghỉ phù hợp với bộ lọc.</td></tr>') + '</table>' + pageBar(page.page,page.count,page.total,'leave') + '</div>' +
    '<p class="mut">Luồng duyệt: Nhân viên gửi đơn → Quản lý phòng ban duyệt → HR xác nhận. Nghỉ phép năm chỉ tính ngày làm việc (không tính cuối tuần, ngày lễ).</p>';
  $('v').innerHTML = h;
}
function lvNew() {
  modal('Tạo đơn nghỉ', [['type_id', 'Loại nghỉ', 'select', window._types.map(function (t) { return [t.id, t.name + (t.paid ? '' : ' (không lương)')]; })], ['from_date', 'Từ ngày', 'date'], ['to_date', 'Đến ngày (bỏ trống nếu nghỉ 1 ngày)', 'date'],
    ['half', 'Hình thức', 'select', [['0', 'Cả ngày'], ['1', 'Nửa ngày (chỉ khi nghỉ 1 ngày)']]], ['reason', 'Lý do', 'area']], {}, async function (v) {
    await api('/leave', 'POST', { type_id: +v.type_id, from_date: v.from_date, to_date: v.to_date || v.from_date, half: v.half === '1', reason: v.reason });
  }, '', 'Gửi đơn');
}
async function lvOk(id) { try { await api('/leave/' + id + '/decide', 'PUT', { action: 'approve' }); toast('Đã chuyển đơn sang bước tiếp theo','success'); render(); } catch (e) { fail(e); } }
function lvNo(id) {
  modal('Từ chối đơn nghỉ', [['note', 'Lý do từ chối', 'area']], {}, async function (v) { await api('/leave/' + id + '/decide', 'PUT', { action: 'reject', note: v.note }); }, '', 'Từ chối');
}
function lvCancel(id) { modal('Hủy đơn nghỉ',[],{},async function(){await api('/leave/'+id+'/cancel','PUT')},'<p>Bạn có chắc muốn hủy đơn nghỉ này không?</p>','Hủy đơn'); }

/* ================= LƯƠNG ================= */
async function vPay() {
  var h = '';
  if (mng()) {
    h += '<div class="bar"><div class="seg"><button class="' + (payTab === 'periods' ? 'on' : '') + '" onclick="payTab=\'periods\';payOpen=null;render()">Kỳ lương</button>' +
      '<button class="' + (payTab === 'salary' ? 'on' : '') + '" onclick="payTab=\'salary\';render()">Thiết lập lương nhân viên</button></div></div>';
    if (payTab === 'salary') return paySalary(h);
  }
  var ps = await api('/payroll/periods');
  if (payOpen) return payDetail(h, ps);
  if (mng()) {
    h += '<div class="bar"><input type="month" id="np_m" value="' + thisMonth() + '" style="width:auto;flex:none"><button class="btn" onclick="payNew()">+ Tạo kỳ lương</button></div>';
    h += '<div class="card tw"><table><tr><th>Tháng</th><th>Trạng thái</th><th>Số phiếu</th><th>Tổng thu nhập</th><th>Tổng thực nhận</th><th></th></tr>' +
      ps.map(function (p) {
        var draft = p.status === 'Nháp';
        return '<tr><td><b>' + p.month + '</b></td><td>' + stTag(p.status) + '</td><td>' + p.headcount + '</td><td>' + fmt(p.total_gross) + '</td><td>' + fmt(p.total_net) + '</td><td style="white-space:nowrap">' +
          '<button class="btn g s" onclick="payOpen=' + p.id + ';render()">Xem</button> ' +
          (draft ? '<button class="btn s" onclick="payCalc(' + p.id + ')">Tính lương</button> <button class="btn s" onclick="payLock(' + p.id + ')">Chốt</button> <button class="btn r s" onclick="payDel(' + p.id + ')">Xóa</button> '
            : (me.role === 'admin' ? '<button class="btn r s" onclick="payUnlock(' + p.id + ')">Mở khóa</button> ' : '')) +
          '<button class="btn g s" onclick="payCsv(' + p.id + ',\'' + p.month + '\')">Xuất CSV</button></td></tr>';
      }).join('') + (ps.length ? '' : '<tr><td colspan="6" class="mut">Chưa có kỳ lương. Hãy thiết lập lương nhân viên, rồi tạo kỳ lương.</td></tr>') + '</table></div>' +
      '<p class="mut">Quy trình: Thiết lập lương → Tạo kỳ → Tính lương → kế toán kiểm tra → Chốt. Sau khi chốt, nhân viên mới xem được phiếu lương của mình. Cấu hình bảo hiểm, thuế ở tab Cấu hình.</p>';
  } else {
    h += '<div class="card"><h2>Phiếu lương của tôi</h2>' + (ps.length ? ps.map(function (p) {
      return '<div class="li"><span>Tháng ' + p.month.slice(5) + '/' + p.month.slice(0, 4) + '</span><button class="btn g s" onclick="payOpen=' + p.id + ';render()">Xem phiếu</button></div>';
    }).join('') : '<p class="mut">Chưa có phiếu lương nào được chốt.</p>') + '</div>';
  }
  $('v').innerHTML = h;
}
async function payDetail(h, ps) {
  var r = await api('/payroll/periods/' + payOpen + '/payslips');
  slips = r.payslips;
  payMonth = r.period.month;
  h += '<div class="bar"><button class="btn g s" onclick="payOpen=null;render()">← Quay lại</button><b style="align-self:center">Kỳ lương ' + r.period.month + '</b> ' + stTag(r.period.status) + '</div>';
  h += '<div class="card tw"><table><tr><th>Mã</th><th>Họ tên</th><th>Công</th><th>Tăng ca</th><th>Thưởng</th><th>Tổng thu nhập</th><th>Bảo hiểm</th><th>Thuế TNCN</th><th>Phạt + tạm ứng</th><th>Thực nhận</th><th></th></tr>' +
    slips.map(function (s, i) {
      return '<tr><td>' + esc(s.employee_code) + '</td><td>' + esc(s.employee_name) + '</td><td>' + s.paid_days + '/' + s.std_days + '</td><td>' + (s.overtime_hours ? s.overtime_hours + 'h · ' + fmt(s.overtime_pay) : '—') + '</td><td>' + (s.bonus ? fmt(s.bonus) : '') + '</td><td>' + fmt(s.gross) + '</td><td>' + fmt(s.insurance) + '</td><td>' + fmt(s.tax) + '</td><td>' + ((s.penalty + s.advance) ? fmt(s.penalty + s.advance) : '') + '</td><td><b>' + fmt(s.net) + '</b></td><td><button class="btn g s" onclick="slip(' + i + ')">Chi tiết</button></td></tr>';
    }).join('') + (slips.length ? '' : '<tr><td colspan="11" class="mut">' + (mng() ? 'Chưa có phiếu lương. Quay lại và bấm "Tính lương".' : 'Không có phiếu lương') + '</td></tr>') + '</table></div>';
  if (mng()) h += await payAdjCard(r.period);
  $('v').innerHTML = h;
}
var ADJ = { bonus: 'Thưởng', penalty: 'Phạt', advance: 'Tạm ứng' };
async function payAdjCard(p) {
  var adj = await api('/payroll/periods/' + p.id + '/adjustments'), draft = p.status === 'Nháp';
  return '<div class="card tw"><h2>Thưởng, phạt, tạm ứng</h2>' +
    (draft ? '<div class="bar"><button class="btn" onclick="adjNew(' + p.id + ')">+ Thêm khoản</button></div>' : '') +
    '<table><tr><th>Mã</th><th>Họ tên</th><th>Loại</th><th>Số tiền</th><th>Lý do / ghi chú</th><th>Người nhập</th><th></th></tr>' +
    adj.map(function (a) {
      return '<tr><td>' + esc(a.code) + '</td><td>' + esc(a.name) + '</td><td>' + ADJ[a.type] + '</td><td>' + fmt(a.amount) + '</td><td>' + esc(a.note) + '</td><td>' + esc(a.created_by) + '</td><td>' +
        (draft ? '<button class="btn r s" onclick="adjDel(' + p.id + ',' + a.id + ')">Xóa</button>' : '') + '</td></tr>';
    }).join('') + (adj.length ? '' : '<tr><td colspan="7" class="mut">Chưa có khoản nào.</td></tr>') + '</table>' +
    (draft ? '<p class="mut">Thưởng cộng vào thu nhập và chịu thuế TNCN. Phạt và tạm ứng trừ vào tiền thực nhận sau thuế. Thêm hoặc xóa xong, bấm "Tính lương" ở danh sách kỳ để cập nhật phiếu.</p>' : '') + '</div>';
}
async function adjNew(pid) {
  var emps = (await api('/employees')).filter(function (e) { return e.status !== 'Nghỉ việc'; });
  modal('Thêm khoản thưởng / phạt / tạm ứng', [
    ['employee_id', 'Nhân viên', 'select', emps.map(function (e) { return [e.id, e.code + ' – ' + e.name]; })],
    ['type', 'Loại', 'select', [['bonus', 'Thưởng'], ['penalty', 'Phạt'], ['advance', 'Tạm ứng']]],
    ['amount', 'Số tiền (VND)', 'number'], ['note', 'Lý do / ghi chú (bắt buộc với thưởng, phạt)']], {}, async function (v) {
    await api('/payroll/periods/' + pid + '/adjustments', 'POST', { employee_id: +v.employee_id, type: v.type, amount: +v.amount, note: v.note });
  });
}
async function adjDel(pid, id) { if (!confirm('Xóa khoản này?')) return; try { await api('/payroll/periods/' + pid + '/adjustments/' + id, 'DELETE'); render(); } catch (e) { fail(e); } }
function slip(i) {
  var s = slips[i], row = function (a, b, cls) { return '<tr' + (cls ? ' style="font-weight:700"' : '') + '><td>' + a + '</td><td style="text-align:right">' + b + '</td></tr>'; };
  var html = '<div class="mut">' + esc(s.employee_code) + ' · ' + esc(s.department || '') + '</div><table style="min-width:0;margin-top:8px">' +
    row('Ngày công chuẩn', s.std_days) + row('Ngày công đi làm', s.present_days) + row('Nghỉ phép có lương', s.paid_leave_days) + row('Nghỉ không lương', s.unpaid_leave_days) + row('Vắng', s.absent_days) +
    row('Lương cơ bản (hợp đồng)', fmt(s.base_salary)) + row('Phụ cấp (hợp đồng)', fmt(s.allowance)) +
    (s.overtime_hours ? row('Tăng ca (' + s.overtime_hours + ' giờ)', '+ ' + fmt(s.overtime_pay)) : '') +
    (s.bonus ? row('Thưởng', '+ ' + fmt(s.bonus)) : '') + row('Tổng thu nhập thực tế', fmt(s.gross), 1) +
    row('Bảo hiểm (BHXH + BHYT + BHTN)', '- ' + fmt(s.insurance)) + row('Người phụ thuộc', s.dependents) + row('Thu nhập tính thuế', fmt(s.taxable)) + row('Thuế TNCN', '- ' + fmt(s.tax)) + (s.penalty ? row('Phạt', '- ' + fmt(s.penalty)) : '') + (s.advance ? row('Tạm ứng', '- ' + fmt(s.advance)) : '') + row('Thực nhận', fmt(s.net), 1) + '</table>';
  html += '<button class="btn g s" onclick="printSlip(' + i + ')">In / lưu PDF</button>';
  modal('Phiếu lương – ' + esc(s.employee_name), [], {}, async function () { }, html, 'Đóng');
}
function printSlip(i) {
  var s = slips[i], w = window.open('', '_blank');
  if (!w) return fail(new Error('Trình duyệt đang chặn cửa sổ in. Hãy cho phép mở cửa sổ bật lên rồi thử lại.'));
  var rows = [
    ['Ngày công chuẩn', s.std_days], ['Ngày công đi làm', s.present_days],
    ['Nghỉ phép có lương', s.paid_leave_days], ['Nghỉ không lương', s.unpaid_leave_days],
    ['Vắng', s.absent_days], ['Lương cơ bản', fmt(s.base_salary)], ['Phụ cấp', fmt(s.allowance)],
  ];
  if (s.overtime_hours) rows.push(['Tăng ca (' + s.overtime_hours + ' giờ)', fmt(s.overtime_pay)]);
  if (s.bonus) rows.push(['Thưởng', fmt(s.bonus)]);
  rows.push(['Tổng thu nhập', fmt(s.gross)], ['Bảo hiểm', fmt(s.insurance)], ['Thu nhập tính thuế', fmt(s.taxable)],
    ['Thuế TNCN', fmt(s.tax)], ['Phạt', fmt(s.penalty)], ['Tạm ứng', fmt(s.advance)], ['Thực nhận', fmt(s.net)]);
  w.document.write('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Phiếu lương</title><style>body{font:14px Arial,sans-serif;max-width:760px;margin:40px auto;color:#18342d}h1{font-size:24px}p{color:#5f716b}table{width:100%;border-collapse:collapse;margin:24px 0}td{padding:10px;border-bottom:1px solid #ddd}td:last-child{text-align:right}tr:last-child{font-weight:bold;font-size:17px}@media print{button{display:none}}</style><h1>Phiếu lương tháng ' + esc(payMonth) + '</h1><p>' + esc(s.employee_name) + ' · ' + esc(s.employee_code) + ' · ' + esc(s.department || '') + '</p><table>' +
    rows.map(function (row) { return '<tr><td>' + esc(row[0]) + '</td><td>' + esc(row[1]) + '</td></tr>'; }).join('') +
    '</table><button onclick="window.print()">In / lưu PDF</button></html>');
  w.document.close();
}
function payNew() {
  var m = $('np_m').value;
  if (!m) return;
  api('/payroll/periods', 'POST', { month: m }).then(function(){toast('Đã tạo kỳ lương','success');render()}).catch(fail);
}
async function payCalc(id) {
  try {
    var r = await api('/payroll/periods/' + id + '/calculate', 'POST');
    var html = '<p>Đã tính lương cho <b>' + r.count + '</b> nhân viên.</p>' + (r.warning ? '<div class="err">' + esc(r.warning) + '</div>' : '') +
      (r.negative && r.negative.length ? '<div class="err">Thực nhận bị âm (phạt + tạm ứng lớn hơn thu nhập): ' + esc(r.negative.join(', ')) + '. Hãy kiểm tra lại.</div>' : '') +
      (r.unapplied_adjustments ? '<div class="err">' + r.unapplied_adjustments + ' nhân viên có thưởng/phạt/tạm ứng nhưng không có phiếu lương (chưa thiết lập lương hoặc đã nghỉ việc), các khoản này chưa được áp dụng.</div>' : '') +
      (r.skipped.length ? '<p class="mut">Bỏ qua ' + r.skipped.length + ' người chưa thiết lập lương: ' + esc(r.skipped.slice(0, 8).join(', ')) + (r.skipped.length > 8 ? '...' : '') + '</p>' : '');
    modal('Kết quả tính lương', [], {}, async function () { }, html, 'Xong');
  } catch (e) { fail(e); }
}
function payLock(id) { modal('Chốt kỳ lương',[],{},async function(){await api('/payroll/periods/'+id+'/lock','POST')},'<p>Sau khi chốt, nhân viên có thể xem phiếu lương và dữ liệu trong kỳ sẽ bị khóa.</p>','Chốt kỳ'); }
function payUnlock(id) { modal('Mở khóa kỳ lương',[],{},async function(){await api('/payroll/periods/'+id+'/unlock','POST')},'<p>Nhân viên sẽ không xem được phiếu cho đến khi kỳ lương được chốt lại.</p>','Mở khóa'); }
function payDel(id) { modal('Xóa kỳ lương nháp',[],{},async function(){await api('/payroll/periods/'+id,'DELETE')},'<p>Thao tác này sẽ xóa kỳ lương nháp. Bạn có chắc muốn tiếp tục?</p>','Xóa kỳ'); }
async function payCsv(id, month) {
  try {
    var r = await fetch('/api/payroll/periods/' + id + '/export', { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!r.ok) throw new Error((await r.json().catch(function () { return {}; })).error || 'Không xuất được file');
    var url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = url; a.download = 'bang-luong-' + month + '.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { fail(e); }
}
async function paySalary(h) {
  var l = await api('/payroll/salary');
  window._sal = l;
  h += '<div class="card tw"><table><tr><th>Mã</th><th>Họ tên</th><th>Lương cơ bản</th><th>Phụ cấp</th><th>NPT</th><th>Đóng BH</th><th>Trạng thái</th><th></th></tr>' +
    l.map(function (x, i) {
      return '<tr><td class="mut">' + esc(x.code) + '</td><td><div class="who">' + avatar(x.name) + '<b>' + esc(x.name) + '</b></div></td><td>' + fmt(x.base_salary) + '</td><td>' + fmt(x.allowance) + '</td><td>' + x.dependents + '</td><td>' + (x.insured ? 'Có' : 'Không') + '</td><td>' +
        (x.configured ? '<span class="tag t-ok">Đã thiết lập</span>' : '<span class="tag t-wa">Chưa có</span>') + '</td><td><button class="btn g s" onclick="salEdit(' + i + ')">Sửa</button></td></tr>';
    }).join('') + '</table></div><p class="mut">Nhân viên chưa thiết lập lương sẽ bị bỏ qua khi tính lương. NPT = số người phụ thuộc đã đăng ký giảm trừ.</p>';
  $('v').innerHTML = h;
}
function salEdit(i) {
  var x = window._sal[i];
  modal('Thiết lập lương – ' + esc(x.name), [['base_salary', 'Lương cơ bản (VND/tháng)', 'number'], ['allowance', 'Tổng phụ cấp (VND/tháng)', 'number'], ['exempt_allowance', 'Trong đó phụ cấp miễn thuế (ăn trưa, điện thoại... theo quy định)', 'number'],
    ['dependents', 'Số người phụ thuộc', 'number'], ['insured', 'Đóng bảo hiểm bắt buộc', 'select', [['1', 'Có'], ['0', 'Không (ví dụ thử việc, hợp đồng dưới 1 tháng)']]],
    ['insured_salary', 'Mức lương đóng BH (để 0 = bằng lương cơ bản)', 'number']], { base_salary: x.base_salary, allowance: x.allowance, exempt_allowance: x.exempt_allowance, dependents: x.dependents, insured: x.insured ? '1' : '0', insured_salary: x.insured_salary }, async function (v) {
    await api('/payroll/salary/' + x.employee_id, 'PUT', { base_salary: +v.base_salary || 0, allowance: +v.allowance || 0, exempt_allowance: +v.exempt_allowance || 0, dependents: +v.dependents || 0, insured: v.insured === '1', insured_salary: +v.insured_salary || 0 });
  });
}

/* ================= CẤU HÌNH ================= */
var CFG = [
  ['Chấm công & nghỉ phép', [['work_start', 'Giờ bắt đầu làm việc (sau giờ này tính đi muộn)', 'time'], ['work_saturday', 'Thứ Bảy', 'select', [['0', 'Nghỉ'], ['1', 'Làm cả ngày']]], ['annual_leave_days', 'Số ngày phép năm', 'number']]],
  ['Tăng ca', [['overtime_rate', 'Hệ số tính tăng ca (mức mẫu, cần kiểm tra chính sách công ty)', 'number']]],
  ['Bảo hiểm & thuế TNCN', [['bhxh_rate', 'BHXH người lao động đóng (%)', 'number'], ['bhyt_rate', 'BHYT người lao động đóng (%)', 'number'], ['bhtn_rate', 'BHTN người lao động đóng (%)', 'number'],
    ['cap_bhxh', 'Trần lương đóng BHXH, BHYT (VND)', 'number'], ['cap_bhtn', 'Trần lương đóng BHTN (VND)', 'number'], ['personal_deduction', 'Giảm trừ bản thân (VND/tháng)', 'number'], ['dependent_deduction', 'Giảm trừ mỗi người phụ thuộc (VND/tháng)', 'number'],
    ['tax_brackets', 'Biểu thuế lũy tiến: "thu nhập tính thuế đến mức:thuế suất %", cách nhau dấu ;, bậc cuối dùng *', 'text']]],
];
async function vCfg() {
  var st = await api('/settings'), yr = new Date().getFullYear(), hol = await api('/holidays?year=' + yr), h = '';
  CFG.forEach(function (sec) {
    h += '<div class="card"><h2>' + sec[0] + '</h2>';
    sec[1].forEach(function (f) {
      h += '<label>' + f[1] + '</label>' + (f[2] === 'select'
        ? '<select id="c_' + f[0] + '">' + f[3].map(function (o) { return '<option value="' + o[0] + '"' + (st[f[0]] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'
        : '<input id="c_' + f[0] + '" type="' + f[2] + '" value="' + esc(st[f[0]]) + '">');
    });
    h += '</div>';
  });
  h += '<div id="cfgmsg"></div><button class="btn" onclick="cfgSave()">Lưu cấu hình</button>' +
    '<p class="mut">Các mức mặc định theo quy định hiệu lực từ 01/7/2026 (giảm trừ 15,5 triệu / 6,2 triệu, biểu thuế 5 bậc, trần BHXH 50,6 triệu). Kế toán cần kiểm tra lại mỗi khi luật hoặc lương cơ sở thay đổi. Trần BHTN đang để theo lương tối thiểu vùng I, hãy sửa nếu công ty ở vùng khác.</p>' +
    '<div class="card" style="margin-top:16px"><h2>Ngày lễ năm ' + yr + '</h2>' + hol.map(function (x) {
      return '<div class="li"><span>' + dmy(x.date) + '/' + x.date.slice(0, 4) + ' – ' + esc(x.name) + '</span><button class="btn r s" onclick="holDel(\'' + x.date + '\')">Xóa</button></div>';
    }).join('') + (hol.length ? '' : '<p class="mut">Chưa nhập ngày lễ nào. Ngày lễ không tính vào công chuẩn và không bị tính vắng.</p>') +
    '<div class="bar" style="margin:10px 0 0"><input type="date" id="h_d" style="flex:none;width:auto"><input id="h_n" placeholder="Tên ngày lễ"><button class="btn" onclick="holAdd()">Thêm</button></div></div>';
  $('v').innerHTML = h;
}
async function cfgSave() {
  var o = {};
  CFG.forEach(function (sec) { sec[1].forEach(function (f) { o[f[0]] = $('c_' + f[0]).value; }); });
  try { await api('/settings', 'PUT', o); $('cfgmsg').innerHTML = '<div class="okm">Đã lưu cấu hình</div>'; toast('Đã lưu cấu hình','success'); }
  catch (e) { if (e.message !== '401') $('cfgmsg').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
}
async function holAdd() {
  try { await api('/holidays', 'POST', { date: $('h_d').value, name: $('h_n').value }); render(); } catch (e) { fail(e); }
}
async function holDel(d) { try { await api('/holidays/' + d, 'DELETE'); render(); } catch (e) { fail(e); } }

/* ================= TĂNG CA ================= */
async function vOvertime() {
  var list = await api('/overtime');
  var h = '<div class="bar"><input id="otSearch" placeholder="Tìm tên hoặc mã nhân viên..." value="' + esc(otQ) + '" oninput="filterRender(\'otSearch\',\'otQ\',\'otPage\')">' +
    '<input type="month" style="width:auto;flex:none" value="' + esc(otMonth) + '" onchange="otMonth=this.value;otPage=1;render()">' +
    (me.role==='employee'?'':'<select style="width:auto" onchange="otDept=this.value;otPage=1;render()"><option value="">Tất cả phòng ban</option>'+depts.map(function(d){return '<option value="'+d.id+'"'+(String(d.id)===otDept?' selected':'')+'>'+esc(d.name)+'</option>'}).join('')+'</select>') +
    '<span class="sp"></span><button class="btn" onclick="otNew()">+ Gửi đề nghị tăng ca</button></div>';
  var filtered=list.filter(function(row){
    var query=otQ.trim().toLocaleLowerCase('vi');
    return (!query||[row.name,row.code].some(function(value){return String(value||'').toLocaleLowerCase('vi').indexOf(query)>=0}))
      &&(!otMonth||row.date.indexOf(otMonth+'-')===0)&&(!otDept||String(row.department_id)===otDept);
  });
  var page=pageData(filtered,otPage,10);otPage=page.page;
  h +=
    '<div class="card tw"><table><tr>' + (me.role === 'employee' ? '' : '<th>Nhân viên</th>') +
    '<th>Ngày</th><th>Số giờ</th><th>Lý do</th><th>Trạng thái</th><th>Phản hồi</th><th></th></tr>' +
    page.items.map(function (row) {
      return '<tr>' + (me.role === 'employee' ? '' : '<td><div class="who">' + avatar(row.name) + '<div><b>' + esc(row.name) + '</b><span class="mut">' + esc(row.department || '') + '</span></div></div></td>') +
        '<td>' + dmy(row.date) + '/' + row.date.slice(0, 4) + '</td><td>' + row.hours + ' giờ</td><td>' + esc(row.reason) + '</td><td>' + stTag(row.status) +
        '</td><td>' + esc(row.manager_note || '') + (row.decided_by ? '<div class="mut">' + esc(row.decided_by) + '</div>' : '') + '</td><td style="white-space:nowrap">' +
        (row.can_decide ? '<button class="btn s" onclick="otDecide(' + row.id + ',\'approve\')">Duyệt</button> <button class="btn r s" onclick="otDecide(' + row.id + ',\'reject\')">Từ chối</button>' : '') +
        (row.can_cancel ? '<button class="btn g s" onclick="otCancel(' + row.id + ')">Hủy</button>' : '') + '</td></tr>';
    }).join('') + (filtered.length ? '' : '<tr><td colspan="7" class="empty">Không tìm thấy đề nghị tăng ca phù hợp với bộ lọc.</td></tr>') +
    '</table>' + pageBar(page.page,page.count,page.total,'overtime') + '</div><p class="mut">Quy trình: nhân viên gửi đề nghị → quản lý phòng ban duyệt → HR xác nhận. Chỉ giờ đã được HR duyệt mới được đưa vào kỳ lương.</p>';
  $('v').innerHTML = h;
}
function otNew() {
  modal('Đề nghị tăng ca', [['date', 'Ngày tăng ca', 'date'], ['hours', 'Số giờ (0,5–12)', 'number'], ['reason', 'Lý do', 'area']], { date: thisMonth() + '-' + ('0' + new Date().getDate()).slice(-2), hours: 1 }, async function (value) {
    await api('/overtime', 'POST', { date: value.date, hours: Number(value.hours), reason: value.reason });
  }, '<p class="mut">Đề nghị sẽ cần quản lý và HR xác nhận trước khi được tính lương.</p>', 'Gửi đề nghị');
}
async function otDecide(id, action) {
  if(action==='reject'){
    modal('Từ chối đề nghị tăng ca',[['note','Lý do từ chối (không bắt buộc)','area']],{},async function(value){await api('/overtime/'+id+'/decide','PUT',{action:action,note:value.note})},'','Từ chối');
    return;
  }
  try { await api('/overtime/' + id + '/decide', 'PUT', { action: action, note: '' }); toast('Đã chuyển đề nghị sang bước tiếp theo','success'); render(); } catch (e) { fail(e); }
}
function otCancel(id) { modal('Hủy đề nghị tăng ca',[],{},async function(){await api('/overtime/'+id+'/cancel','PUT')},'<p>Bạn có chắc muốn hủy đề nghị tăng ca này không?</p>','Hủy đề nghị'); }

/* ================= BÁO CÁO ================= */
var reportMonth = thisMonth(), reportDept = '';
async function vReports() {
  var h = '<div class="bar"><input type="month" value="' + reportMonth + '" style="width:auto;flex:none" onchange="if(this.value){reportMonth=this.value;render()}">' +
    '<select style="width:auto" onchange="reportDept=this.value;render()"><option value="">Tất cả phòng ban</option>' +
    depts.map(function (dept) { return '<option value="' + dept.id + '"' + (String(dept.id) === reportDept ? ' selected' : '') + '>' + esc(dept.name) + '</option>'; }).join('') +
    '</select><span class="sp"></span><button class="btn g" onclick="reportCsv()">Xuất CSV</button></div>';
  var report = await api('/reports?month=' + encodeURIComponent(reportMonth) + '&department_id=' + encodeURIComponent(reportDept));
  h += '<div class="kpis">' + kpi('Nhân sự đang làm', report.headcount, 'theo bộ lọc','people') +
    kpi('Đi làm', report.attendance.present, 'ngày công trong tháng','check') +
    kpi('Vắng', report.attendance.absent, 'ngày công','doc') +
    kpi('Đi muộn', report.attendance.late, 'lượt','clock') +
    kpi('Thiếu check-out', report.attendance.missing_checkout, 'lượt cần rà soát','hourglass') +
    kpi('Tăng ca đã duyệt', report.overtime.hours, report.overtime.requests + ' đề nghị','clock') + '</div>';
  h += '<div class="grid"><div class="card"><h2>Nhân sự theo phòng ban</h2>' +
    (report.by_department.length ? bars(report.by_department.map(function (row) { return { n: row.name, v: row.count }; })) : '<p class="mut">Chưa có dữ liệu.</p>') +
    '</div><div class="card"><h2>Nhân sự theo trạng thái</h2>' +
    (report.by_status.length ? bars(report.by_status.map(function (row) { return { n: row.name, v: row.count }; })) : '<p class="mut">Chưa có dữ liệu.</p>') + '</div></div>';
  h += '<div class="card tw"><h2>Đơn nghỉ giao với tháng ' + reportMonth + '</h2><table><tr><th>Trạng thái</th><th>Số đơn</th><th>Số ngày</th></tr>' +
    report.leave.map(function (row) { return '<tr><td>' + stTag(row.status) + '</td><td>' + row.requests + '</td><td>' + row.days + '</td></tr>'; }).join('') +
    (report.leave.length ? '' : '<tr><td colspan="3" class="empty">Không có đơn nghỉ trong khoảng thời gian này.</td></tr>') + '</table></div>';
  if (report.payroll.length) {
    h += '<div class="card tw"><h2>Chi phí lương đã chốt</h2><table><tr><th>Phòng ban</th><th>Số phiếu</th><th>Tổng thu nhập</th><th>Thực nhận</th></tr>' +
      report.payroll.map(function (row) { return '<tr><td>' + esc(row.department || 'Chưa phân bổ') + '</td><td>' + row.headcount + '</td><td>' + fmt(row.gross) + '</td><td><b>' + fmt(row.net) + '</b></td></tr>'; }).join('') +
      '</table></div>';
  }
  $('v').innerHTML = h;
}
async function reportCsv() {
  try {
    var url = '/api/reports/export?month=' + encodeURIComponent(reportMonth) + '&department_id=' + encodeURIComponent(reportDept);
    var response = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!response.ok) throw new Error((await response.json().catch(function () { return {}; })).error || 'Không xuất được báo cáo');
    var link = document.createElement('a'), blob = URL.createObjectURL(await response.blob());
    link.href = blob; link.download = 'bao-cao-hr-' + reportMonth + '.csv'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(blob);
  } catch (error) { fail(error); }
}

/* ================= THÔNG BÁO ================= */
async function vNotifications() {
  var result = await api('/notifications');
  $('v').innerHTML = '<div class="bar"><span class="mut">' + result.unread + ' thông báo chưa đọc</span><span class="sp"></span>' +
    (result.unread ? '<button class="btn g s" onclick="notifyReadAll()">Đánh dấu đã đọc tất cả</button>' : '') + '</div>' +
    '<div class="card">' + result.notifications.map(function (note) {
      return '<div class="li notification' + (note.read_at ? '' : ' unread') + '"><span><b>' + esc(note.title) + '</b><small class="mut">' + esc(note.message) + ' · ' + esc(note.created_at) + '</small></span>' +
        (note.read_at ? '' : '<button class="btn g s" onclick="notifyOpen(' + note.id + ',\'' + esc(note.href).replace(/'/g, '&#39;') + '\')">Xem</button>') + '</div>';
    }).join('') + (result.notifications.length ? '' : '<p class="empty">Bạn chưa có thông báo nào.</p>') + '</div>';
}
async function notifyOpen(id, href) {
  try {
    await api('/notifications/' + id + '/read', 'PUT');
    var view = { '/leave': 'leave', '/overtime': 'overtime', '/pay': 'pay' }[href];
    if (view) return go(view);
    render();
  } catch (error) { fail(error); }
}
async function notifyReadAll() {
  try { await api('/notifications/read-all', 'PUT'); render(); } catch (error) { fail(error); }
}

/* ================= HỒ SƠ - LỊCH SỬ ================= */
async function showHistory(employeeId) {
  try {
    var rows = await api('/history?employee_id=' + encodeURIComponent(employeeId));
    var html = '<div class="history-list">' + rows.map(function (row) {
      var changes = row.changes;
      var details = Object.keys(changes).map(function (field) {
        var value = changes[field];
        if (value && typeof value === 'object' && ('old' in value || 'new' in value)) {
          return '<tr><td>' + esc(field) + '</td><td>' + esc(value.old == null ? '—' : value.old) + '</td><td>' + esc(value.new == null ? '—' : value.new) + '</td></tr>';
        }
        return '<tr><td>' + esc(field) + '</td><td colspan="2">' + esc(JSON.stringify(value)) + '</td></tr>';
      }).join('');
      return '<div class="li"><span><b>' + (row.entity === 'salary' ? 'Thay đổi lương' : 'Hồ sơ nhân viên') + '</b><small class="mut">' +
        esc(row.created_at) + ' · ' + esc(row.actor_email) + '</small><table style="min-width:0;margin-top:8px"><tr><th>Nội dung</th><th>Trước</th><th>Sau</th></tr>' +
        details + '</table></span></div>';
    }).join('') + (rows.length ? '' : '<p class="empty">Chưa có thay đổi nào được ghi nhận.</p>') + '</div>';
    modal('Lịch sử · ' + esc(rows[0] ? rows[0].employee_name : 'Hồ sơ nhân viên'), [], {}, async function () {}, html, 'Đóng');
  } catch (error) { fail(error); }
}
