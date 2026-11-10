/* Bộ icon, logo, tranh minh hoạ và avatar dùng chung cho giao diện.
   Icon vẽ tay dạng "nét + mảng màu nhạt", bo tròn, đồng bộ với nhau. */
var ICONS = {
  home: '<path class="f" d="M4.5 10.6 12 4.2l7.5 6.4V19a1.6 1.6 0 0 1-1.6 1.6H6.1A1.6 1.6 0 0 1 4.5 19z"/><path d="M9.6 20.6v-4.7a2.4 2.4 0 0 1 4.8 0v4.7"/>',
  clock: '<circle class="f" cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.1 2"/>',
  leave: '<circle class="f" cx="16.4" cy="7.6" r="3.1"/><path d="M3.5 14.6c2.2 0 2.2-1.5 4.4-1.5s2.2 1.5 4.4 1.5 2.2-1.5 4.4-1.5 2.2 1.5 4.4 1.5"/><path d="M3.5 19.2c2.2 0 2.2-1.5 4.4-1.5s2.2 1.5 4.4 1.5 2.2-1.5 4.4-1.5 2.2 1.5 4.4 1.5"/>',
  pay: '<path class="f" d="M4 8.6A2.6 2.6 0 0 1 6.6 6H18a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2H6.6A2.6 2.6 0 0 1 4 17z"/><path d="M4 8.6C4 7.4 5 6.4 6.3 6.2L15.5 4.4"/><circle cx="16.2" cy="13.6" r="1.1"/>',
  people: '<circle class="f" cx="9" cy="8.6" r="3.3"/><path d="M3.4 19.2c0-3 2.5-5.1 5.6-5.1s5.6 2.1 5.6 5.1"/><circle cx="17.2" cy="9.6" r="2.4"/><path d="M16.3 14.3c2.9-.3 5 1.4 5 4.3"/>',
  org: '<path class="f" d="M5 20.4V6.6A1.6 1.6 0 0 1 6.6 5H13a1.6 1.6 0 0 1 1.6 1.6v13.8"/><path d="M14.6 10.2H18a1.6 1.6 0 0 1 1.6 1.6v8.6M3.4 20.4h17.2M8.6 9h2M8.6 12.5h2M8.6 16h2"/>',
  cfg: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h10M18 17h2"/><circle class="f" cx="15" cy="7" r="2.1"/><circle class="f" cx="9" cy="12" r="2.1"/><circle class="f" cx="16" cy="17" r="2.1"/>',
  key: '<circle class="f" cx="8.4" cy="14.6" r="4.1"/><path d="M11.4 11.6 19 4M16 7l2.4 2.4M13.8 9.2l1.6 1.6"/>',
  logs: '<path class="f" d="M6.4 4.4h8.2l3.9 3.9v10.3a1.8 1.8 0 0 1-1.8 1.8H6.4a1.8 1.8 0 0 1-1.8-1.8V6.2a1.8 1.8 0 0 1 1.8-1.8z"/><path d="M14.4 4.6v3.9h3.9M8.4 12.6h7M8.4 16h4.4"/>',
  check: '<circle class="f" cx="12" cy="12" r="8.6"/><path d="m8.2 12.4 2.5 2.5 5.1-5.4"/>',
  spark: '<path class="f" d="M12 3.4c.6 3.6 1.9 5 5.6 5.6-3.7.6-5 2-5.6 5.6-.6-3.6-1.9-5-5.6-5.6 3.7-.6 5-2 5.6-5.6z"/><path d="M18.4 15.2c.3 1.6.9 2.2 2.4 2.5-1.5.3-2.1.9-2.4 2.5-.3-1.6-.9-2.2-2.4-2.5 1.5-.3 2.1-.9 2.4-2.5z"/>',
  doc: '<rect class="f" x="5" y="3.8" width="14" height="16.4" rx="3"/><path d="M8.6 9h6.8M8.6 12.6h6.8M8.6 16h3.8"/>',
  hourglass: '<path class="f" d="M7 4.2h10v2.6c0 2.6-2.2 3.6-3.4 5.2 1.2 1.6 3.4 2.6 3.4 5.2v2.6H7v-2.6c0-2.6 2.2-3.6 3.4-5.2C9.2 10.4 7 9.4 7 6.8z"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h9"/>',
  out: '<path d="M9.5 4.6H6.6A1.6 1.6 0 0 0 5 6.2v11.6a1.6 1.6 0 0 0 1.6 1.6h2.9M14 8.2l3.8 3.8-3.8 3.8M17.8 12H9.4"/>',
  lock: '<rect class="f" x="5.4" y="10.4" width="13.2" height="9.6" rx="3"/><path d="M8.6 10.4V8a3.4 3.4 0 0 1 6.8 0v2.4"/>',
  sun: '<circle class="f" cx="12" cy="12" r="4"/><path d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M18 6l-1.3 1.3M7.3 16.7 6 18"/>'
};
function ico(n, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || ICONS.doc) + '</svg>'; }

/* Logo: hai chiếc lá chụm vào nhau, cũng là hai người đứng cạnh nhau */
var LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="13" fill="#FFE8A3"/>' +
  '<path d="M12 29c-3-8 0-15 8-17 1 8-1 15-8 17z" fill="#0F6B57"/><path d="M28 29c3-8 0-15-8-17-1 8 1 15 8 17z" fill="#FF6B57"/>' +
  '<circle cx="20" cy="30.5" r="2.6" fill="#0C3A32"/></svg>';
function brand(sub) { return '<div class="brand">' + LOGO + '<div>HRM' + (sub ? '<small>' + sub + '</small>' : '') + '</div></div>'; }

/* Tranh minh hoạ: nhóm đồng nghiệp trên đồi cỏ, có cây và mặt trời */
function scene(dark) {
  function person(x, base, h, shirt, skin, hair, bun) {
    var hy = base - h - 15;
    return '<path d="M' + (x - 23) + ' ' + base + 'v-' + (h - 22) + 'a23 22 0 0 1 46 0v' + (h - 22) + 'z" fill="' + shirt + '"/>' +
      '<rect x="' + (x - 5) + '" y="' + (hy + 10) + '" width="10" height="12" rx="4" fill="' + skin + '"/>' +
      (bun ? '<circle cx="' + x + '" cy="' + (hy - 15) + '" r="7" fill="' + hair + '"/>' : '') +
      '<circle cx="' + x + '" cy="' + hy + '" r="15" fill="' + skin + '"/>' +
      '<path d="M' + (x - 16) + ' ' + (hy - 1) + 'a16 16 0 0 1 32 0c-6-2-10-5-12-9-3 5-10 8-20 9z" fill="' + hair + '"/>' +
      '<circle cx="' + (x - 6) + '" cy="' + (hy + 3) + '" r="1.5" fill="#3A2A22"/><circle cx="' + (x + 6) + '" cy="' + (hy + 3) + '" r="1.5" fill="#3A2A22"/>' +
      '<path d="M' + (x - 4) + ' ' + (hy + 8) + 'q4 3.4 8 0" stroke="#3A2A22" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
  }
  return '<svg class="scene" viewBox="0 0 440 280" role="img" aria-label="Nhóm đồng nghiệp đang làm việc cùng nhau">' +
    '<circle cx="342" cy="84" r="48" fill="#FF9F8C"/><circle cx="342" cy="84" r="30" fill="#FFB9AA"/>' +
    '<path d="M0 280V212C68 178 152 182 214 202c70 22 140-8 226-28V280z" fill="#BFE3D0"/>' +
    '<path d="M0 280v-34c84-26 176-18 248 4s130 8 192-8V280z" fill="#7CC4A6"/>' +
    /* cây */
    '<path d="M52 262c-2-26 0-52 8-78" stroke="#0F6B57" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="42" cy="196" rx="13" ry="25" transform="rotate(-38 42 196)" fill="#0F6B57"/><ellipse cx="76" cy="178" rx="12" ry="24" transform="rotate(34 76 178)" fill="#2A8F74"/>' +
    '<ellipse cx="46" cy="228" rx="11" ry="21" transform="rotate(-52 46 228)" fill="#2A8F74"/><ellipse cx="74" cy="222" rx="10" ry="20" transform="rotate(48 74 222)" fill="#0F6B57"/>' +
    '<path d="M38 262h30l-4 18H42z" fill="#FF6B57"/>' +
    /* người */
    person(168, 254, 84, '#7A6AF0', '#F2C4A0', '#2B2A33', false) +
    person(236, 258, 104, '#FFFFFF', '#C98F6B', '#3A2418', true) +
    person(304, 254, 76, '#F2B531', '#E8B48C', '#5A3A24', false) +
    /* bong bóng chat */
    '<g transform="translate(206 38)"><rect width="116" height="52" rx="20" fill="#fff"/><path d="M26 52l-2 14 16-14z" fill="#fff"/>' +
    '<circle cx="28" cy="26" r="12" fill="#CFEBDD"/><path d="m22.4 26.4 4 4 7.4-8" stroke="#0F6B57" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect x="48" y="17" width="52" height="7" rx="3.5" fill="#E0E7E1"/><rect x="48" y="30" width="34" height="7" rx="3.5" fill="#EDF1ED"/></g>' +
    /* hạt trang trí */
    '<circle cx="132" cy="92" r="6" fill="#FFE8A3"/><circle cx="398" cy="170" r="8" fill="#E0D9FF"/><path d="M118 130l5 9 9 5-9 5-5 9-5-9-9-5 9-5z" fill="#FFFFFF" fill-opacity=".85"/>' +
    '</svg>';
}

/* Avatar chữ cái đầu, mỗi người một màu pastel cố định theo tên */
function avc(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 6; }
function initial(name) { return String(name || '?').trim().split(/\s+/).pop().charAt(0).toUpperCase(); }
function avatar(name, big) { return '<span class="av av-' + avc(name) + (big ? ' l' : '') + '">' + esc(initial(name)) + '</span>'; }
