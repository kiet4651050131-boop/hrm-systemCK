/* Bộ icon outline theo quy ước quen thuộc của dashboard quản trị. */
var ICONS = {
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  leave: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 15h3m2 0h3"/>',
  pay: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  org: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V8h6v13M9 12h6M6.5 7h.01M6.5 11h.01M6.5 15h.01M17.5 7h.01M17.5 11h.01M17.5 15h.01"/>',
  cfg: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M2 14h4M10 8h4M18 16h4"/>',
  key: '<circle cx="8" cy="15" r="5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3M18.5 4.5l3 3"/>',
  logs: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  spark: '<circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6M22 11h-6"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  hourglass: '<path d="M6 2h12M6 22h12M8 2v5l4 5-4 5v5M16 2v5l-4 5 4 5v5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  out: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
  lock: '<rect x="4" y="11" width="16" height="11" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4M12 15v3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'
};
function ico(n, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || ICONS.doc) + '</svg>'; }

/* Logo: hai chiếc lá chụm vào nhau, cũng là hai người đứng cạnh nhau */
var LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="13" fill="#DDF2FF"/>' +
  '<path d="M12 29c-3-8 0-15 8-17 1 8-1 15-8 17z" fill="#167FC1"/><path d="M28 29c3-8 0-15-8-17-1 8 1 15 8 17z" fill="#53B8D9"/>' +
  '<circle cx="20" cy="30.5" r="2.6" fill="#123B58"/></svg>';
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
    '<circle cx="342" cy="84" r="48" fill="#8CCFF0"/><circle cx="342" cy="84" r="30" fill="#B7E4F8"/>' +
    '<path d="M0 280V212C68 178 152 182 214 202c70 22 140-8 226-28V280z" fill="#D5ECF8"/>' +
    '<path d="M0 280v-34c84-26 176-18 248 4s130 8 192-8V280z" fill="#91CBE8"/>' +
    /* cây */
    '<path d="M52 262c-2-26 0-52 8-78" stroke="#287CA8" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="42" cy="196" rx="13" ry="25" transform="rotate(-38 42 196)" fill="#287CA8"/><ellipse cx="76" cy="178" rx="12" ry="24" transform="rotate(34 76 178)" fill="#48A9B8"/>' +
    '<ellipse cx="46" cy="228" rx="11" ry="21" transform="rotate(-52 46 228)" fill="#48A9B8"/><ellipse cx="74" cy="222" rx="10" ry="20" transform="rotate(48 74 222)" fill="#287CA8"/>' +
    '<path d="M38 262h30l-4 18H42z" fill="#F2C66D"/>' +
    /* người */
    person(168, 254, 84, '#568DCC', '#F2C4A0', '#2B2A33', false) +
    person(236, 258, 104, '#FFFFFF', '#C98F6B', '#3A2418', true) +
    person(304, 254, 76, '#F2C66D', '#E8B48C', '#5A3A24', false) +
    /* bong bóng chat */
    '<g transform="translate(206 38)"><rect width="116" height="52" rx="20" fill="#fff"/><path d="M26 52l-2 14 16-14z" fill="#fff"/>' +
    '<circle cx="28" cy="26" r="12" fill="#DDF2FF"/><path d="m22.4 26.4 4 4 7.4-8" stroke="#167FC1" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect x="48" y="17" width="52" height="7" rx="3.5" fill="#E0E7E1"/><rect x="48" y="30" width="34" height="7" rx="3.5" fill="#EDF1ED"/></g>' +
    /* hạt trang trí */
    '<circle cx="132" cy="92" r="6" fill="#F5D487"/><circle cx="398" cy="170" r="8" fill="#D6E8FB"/><path d="M118 130l5 9 9 5-9 5-5 9-5-9-9-5 9-5z" fill="#FFFFFF" fill-opacity=".9"/>' +
    '</svg>';
}

/* Avatar chữ cái đầu, mỗi người một màu pastel cố định theo tên */
function avc(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 6; }
function initial(name) { return String(name || '?').trim().split(/\s+/).pop().charAt(0).toUpperCase(); }
function avatar(name, big) { return '<span class="av av-' + avc(name) + (big ? ' l' : '') + '">' + esc(initial(name)) + '</span>'; }
