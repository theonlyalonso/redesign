/* =========================================================
   Simulator Superstars — Seasons page (the old predef.html, new look)
   Needs: script.js (theme, menus, toast) loaded first, and the real
   index.js / predef-home-settings.js / twistmenu.js on the page.

   - The season list (SEASONS) was generated from the real predef.html: same tabs,
     same order, same predefCast(...) arguments. The Play button carries the original
     inline  onclick="predefCast(...)"  so the real simulator starts exactly as before.
   - The pen button  = Track Record Mode  (real: openTrackRecordModeFromButton)
   - The sliders button = "Open on Home with this cast and settings"
                          (real: saveHomeSettingsFromPredefButton, then go to index.html)
   - The "Custom Casts" tab is drawn from the real  allCustomCasts  list.
   ========================================================= */
(function () {
  "use strict";

  /* Set to true to show the real season posters (hosted by the wiki, listed in index.js as imgTxtPrdf)
     instead of the generic pink star tile. */
  var USE_POSTERS = false;

  var SS = window.SS || {};
  var toast = SS.toast || function () {};

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- Flags: tiny inline SVGs (24x24, clipped to a circle by CSS) ---------- */
  var UK =
    '<rect width="24" height="24" fill="#012169"/>' +
    '<path d="M0 0L24 24M24 0L0 24" stroke="#fff" stroke-width="4.5"/>' +
    '<path d="M0 0L24 24M24 0L0 24" stroke="#c8102e" stroke-width="1.6"/>' +
    '<path d="M12 0V24M0 12H24" stroke="#fff" stroke-width="7"/>' +
    '<path d="M12 0V24M0 12H24" stroke="#c8102e" stroke-width="4"/>';

  var FLAGS = {
    us:
      '<rect width="24" height="24" fill="#fff"/>' +
      '<g fill="#b22234"><rect y="0" width="24" height="3.43"/><rect y="6.86" width="24" height="3.43"/>' +
      '<rect y="13.71" width="24" height="3.43"/><rect y="20.57" width="24" height="3.43"/></g>' +
      '<rect width="11" height="13.7" fill="#3c3b6e"/>' +
      '<g fill="#fff"><circle cx="3" cy="3" r=".8"/><circle cx="7.5" cy="3" r=".8"/><circle cx="5.2" cy="6.8" r=".8"/>' +
      '<circle cx="3" cy="10.5" r=".8"/><circle cx="7.5" cy="10.5" r=".8"/></g>',
    uk: UK,
    ca:
      '<rect width="24" height="24" fill="#fff"/><rect width="6" height="24" fill="#d52b1e"/><rect x="18" width="6" height="24" fill="#d52b1e"/>' +
      '<polygon points="12,5 13.4,8.2 16.2,7.2 15.2,11 17.4,10.6 14.4,13.6 14.8,14.6 12.8,14.4 12.8,18 11.2,18 11.2,14.4 9.2,14.6 9.6,13.6 6.6,10.6 8.8,11 7.8,7.2 10.6,8.2" fill="#d52b1e"/>',
    es: '<rect width="24" height="24" fill="#aa151b"/><rect y="6" width="24" height="12" fill="#f1bf00"/>',
    au:
      '<rect width="24" height="24" fill="#012169"/><g transform="scale(.5)">' + UK + '</g>' +
      '<polygon points="7,15 7.9,17.2 10.3,17.3 8.4,18.8 9.1,21.1 7,19.8 4.9,21.1 5.6,18.8 3.7,17.3 6.1,17.2" fill="#fff"/>' +
      '<g fill="#fff"><circle cx="17" cy="6" r="1"/><circle cx="19.5" cy="12" r="1"/><circle cx="15" cy="13" r="1"/><circle cx="17.5" cy="19" r="1"/></g>',
    fr: '<rect width="24" height="24" fill="#fff"/><rect width="8" height="24" fill="#0055a4"/><rect x="16" width="8" height="24" fill="#ef4135"/>',
    it: '<rect width="24" height="24" fill="#fff"/><rect width="8" height="24" fill="#009246"/><rect x="16" width="8" height="24" fill="#ce2b37"/>',
    ph:
      '<rect width="24" height="12" fill="#0038a8"/><rect y="12" width="24" height="12" fill="#ce1126"/>' +
      '<polygon points="0,0 14,12 0,24" fill="#fff"/><circle cx="4.6" cy="12" r="2" fill="#fcd116"/>',
    th:
      '<rect width="24" height="24" fill="#a51931"/><rect y="4" width="24" height="16" fill="#f4f5f8"/><rect y="8" width="24" height="8" fill="#2d2a4a"/>',
    nl: '<rect width="24" height="8" fill="#ae1c28"/><rect y="8" width="24" height="8" fill="#fff"/><rect y="16" width="24" height="8" fill="#21468b"/>',
    be: '<rect width="8" height="24" fill="#000"/><rect x="8" width="8" height="24" fill="#fae042"/><rect x="16" width="8" height="24" fill="#ed2939"/>',
    mx:
      '<rect width="8" height="24" fill="#006847"/><rect x="8" width="8" height="24" fill="#fff"/><rect x="16" width="8" height="24" fill="#ce1126"/>' +
      '<circle cx="12" cy="12" r="2.4" fill="#a8703a"/>',
    br:
      '<rect width="24" height="24" fill="#009c3b"/><polygon points="12,3 22,12 12,21 2,12" fill="#ffdf00"/>' +
      '<circle cx="12" cy="12" r="4.6" fill="#002776"/><path d="M7.6 11.2q4.6-1.8 8.8 1.2" stroke="#fff" stroke-width="1" fill="none"/>',
    se: '<rect width="24" height="24" fill="#006aa7"/><rect x="7" width="4" height="24" fill="#fecc02"/><rect y="10" width="24" height="4" fill="#fecc02"/>',
    de: '<rect width="24" height="8" fill="#000"/><rect y="8" width="24" height="8" fill="#dd0000"/><rect y="16" width="24" height="8" fill="#ffce00"/>',
    cl:
      '<rect width="24" height="24" fill="#fff"/><rect y="12" width="24" height="12" fill="#d52b1e"/><rect width="12" height="12" fill="#0039a6"/>' +
      '<polygon points="6,2.6 7,5 9.6,5.1 7.5,6.7 8.2,9.2 6,7.8 3.8,9.2 4.5,6.7 2.4,5.1 5,5" fill="#fff"/>'
  };

  function flagHTML(c) {
    if (c.flag) {
      return '<span class="flag" aria-hidden="true"><svg viewBox="0 0 24 24">' + FLAGS[c.flag] + "</svg></span>";
    }
    return '<span class="flag flag--icon" aria-hidden="true"><svg class="icon"><use href="#' + c.icon + '"/></svg></span>';
  }

  /* ---------- Tabs (same names and order as the real predef.html; flags/icons are the design's) ----------
     The "oc" strings below are the original onclick calls, untouched. */
  var COUNTRIES = [
    { id: "usa",          label: "USA",          flag: "us" },
    { id: "all-stars",    label: "All Stars",    icon: "i-star" },
    { id: "global",       label: "Global",       icon: "i-globe" },
    { id: "uk",           label: "UK",           flag: "uk" },
    { id: "canada",       label: "Canada",       flag: "ca" },
    { id: "espana",       label: "España",       flag: "es" },
    { id: "down-under",   label: "Down Under",   flag: "au" },
    { id: "france",       label: "France",       flag: "fr" },
    { id: "italia",       label: "Italia",       flag: "it" },
    { id: "philippines",  label: "Philippines",  flag: "ph" },
    { id: "thailand",     label: "Thailand",     flag: "th" },
    { id: "holland",      label: "Holland",      flag: "nl" },
    { id: "belgique",     label: "Belgique",     flag: "be" },
    { id: "mexico",       label: "México",       flag: "mx" },
    { id: "brasil",       label: "Brasil",       flag: "br" },
    { id: "sverige",      label: "Sverige",      flag: "se" },
    { id: "germany",      label: "Germany",      flag: "de" },
    { id: "the-switch",   label: "The Switch",   flag: "cl" },
    { id: "la-mas-draga", label: "La Más Draga", flag: "mx" },
    { id: "dragula",      label: "Dragula",      icon: "i-skull" },
    { id: "other-shows",  label: "Other Shows",  icon: "i-tv" },
    { id: "custom-casts", label: "Custom Casts", icon: "i-user-plus", custom: true }
  ];

  /* Generated from predef.html: [tab, [[group name, [[season title, onclick call, overlay id], ...]], ...]] */
  var SEASONS = [
 [
  [
   "RuPaul's Drag Race US",
   [
    [
     "Season 1",
     "predefCast(us_season1, 'regular', 'top3')",
     "usseason1"
    ],
    [
     "Season 2",
     "predefCast(us_season2, 'regular', 'top3')",
     "usseason2"
    ],
    [
     "Season 3",
     "predefCast(us_season3, 'regular', 'top3', '', 'choose')",
     "usseason3"
    ],
    [
     "Season 4",
     "predefCast(us_season4, 'regular', 'top3', '', 'choose')",
     "usseason4"
    ],
    [
     "Season 5",
     "predefCast(us_season5, 'regular', 'top3')",
     "usseason5"
    ],
    [
     "Season 6",
     "predefCast(us_season6, 'regular', 'top4', 's6-premiere')",
     "usseason6"
    ],
    [
     "Season 7",
     "predefCast(us_season7, 'regular', 'top4', '', 'conjoined-queens')",
     "usseason7"
    ],
    [
     "Season 8",
     "predefCast(us_season8, 'regular', 'top4', '', 'choose')",
     "usseason8"
    ],
    [
     "Season 9",
     "predefCast(us_season9, 'regular', 'LFTC', 's9-premiere')",
     "usseason9"
    ],
    [
     "Season 10",
     "predefCast(us_season10, 'regular', 'LFTC')",
     "usseason10"
    ],
    [
     "Season 11",
     "predefCast(us_season11, 'regular', 'LFTC')",
     "usseason11"
    ],
    [
     "Season 12",
     "predefCast(us_season12, 'regular', 'top3', 's12-premiere')",
     "usseason12"
    ],
    [
     "Season 13",
     "predefCast(us_season13, 'regular', 'LFTC', 'porkchop')",
     "usseason13"
    ],
    [
     "Season 14",
     "predefCast(us_season14, 'regular', 'top5', 's14-premiere')",
     "usseason14"
    ],
    [
     "Season 15",
     "predefCast(us_season15, 'regular', 'teams')",
     "usseason15"
    ],
    [
     "Season 16",
     "predefCast(us_season16, 'regular', 'rankedtop3', 'rateaqueen')",
     "usseason16"
    ],
    [
     "Season 17",
     "predefCast(us_season17, 'regular', 'teams', 's17-premiere')",
     "usseason17"
    ],
    [
     "Season 18",
     "predefCast(us_season18, 'regular', 'top3', 'slayers-premiere')",
     "usseason18"
    ],
    [
     "Season 19",
     "predefCast(us_season19, 'regular', 'teams', 'slayers-premiere')",
     "usseason19"
    ]
   ]
  ]
 ],
 [
  [
   "All Stars",
   [
    [
     "Season 1",
     "predefCast(allstars_1, 'team', 'teams')",
     "asseason1"
    ],
    [
     "Season 2",
     "predefCast(allstars_2, 'all-stars', 'top4', '', 'queensofcomedy')",
     "asseason2"
    ],
    [
     "Season 3",
     "predefCast(allstars_3, 'all-stars', 'jury', '', 'kittygirlgroup')",
     "asseason3"
    ],
    [
     "Season 4",
     "predefCast(allstars_4, 'all-stars', 'teams', '', 'lalaparuza')",
     "asseason4"
    ],
    [
     "Season 5",
     "predefCast(allstars_5, 'og-lipsync-assassin', 'top3')",
     "asseason5"
    ],
    [
     "Season 6",
     "predefCast(allstars_6, 'lipsync-assassin', 'top4', '', 'smackdown')",
     "asseason6"
    ],
    [
     "Season 7",
     "predefCast(allstars_7, 'all-winners', 'LFTC', '', '')",
     "asseason7"
    ],
    [
     "Season 8",
     "predefCast(allstars_8, 'lipsync-assassin', 'top2')",
     "asseason8"
    ],
    [
     "Season 9",
     "predefCast(allstars_9, 'charity-format', 'top3')",
     "asseason9"
    ],
    [
     "Season 10",
     "predefCast(allstars_10, 'brackets-format', 'top8ls', '', '')",
     "asseason10"
    ],
    [
     "Season 11",
     "predefCast(AS11_Cast, 'brackets-format', 'top6as11', '', '')",
     "asseason11"
    ],
    [
     "Season 12",
     "predefCast(allstars_12, 'brackets-format', 'top3', '', '')",
     "asseason12"
    ]
   ]
  ]
 ],
 [
  [
   "Global All Stars",
   [
    [
     "Season 1",
     "predefCast(gas_1, 'regular', 'rankedtop4', 'global-premiere')",
     "gasseason1"
    ]
   ]
  ]
 ],
 [
  [
   "RuPaul's Drag Race UK",
   [
    [
     "Series 1",
     "predefCast(uk_season1, 'regular', 'top3')",
     "ukseason1"
    ],
    [
     "Series 2",
     "predefCast(uk_season2, 'regular', 'top4', '', 'vote')",
     "ukseason2"
    ],
    [
     "Series 3",
     "predefCast(uk_season3, 'regular', 'top3', 'uk3-premiere')",
     "ukseason3"
    ],
    [
     "Series 4",
     "predefCast(uk_season4, 'regular', 'teams')",
     "ukseason4"
    ],
    [
     "Series 5",
     "predefCast(uk_season5, 'regular', 'top3', 'slayers-premiere')",
     "ukseason5"
    ],
    [
     "Series 6",
     "predefCast(uk_season6, 'regular', 'teams', 'slayers-premiere')",
     "ukseason6"
    ],
    [
     "Series 7",
     "predefCast(UK7_Cast, 'regular', 'teams')",
     "ukseason7"
    ],
    [
     "Series 8",
     "predefCast(UK8_Cast, 'regular', 'top4', 'uk8-premiere')",
     "ukseason8"
    ]
   ]
  ],
  [
   "UK vs The World",
   [
    [
     "Season 1",
     "predefCast(ukvstw_1, 'all-stars', 'LFTC')",
     "ukvstwseason1"
    ],
    [
     "Season 2",
     "predefCast(ukvstw_2, 'all-stars', 'LFTC')",
     "ukvstwseason2"
    ],
    [
     "Season 3",
     "predefCast(ukvstw_3, 'regular', 'LFTC', 'slayers-premiere')",
     "ukvstwseason3"
    ]
   ]
  ]
 ],
 [
  [
   "Canada's Drag Race",
   [
    [
     "Season 1",
     "predefCast(can_season1, 'regular', 'top3')",
     "canseason1"
    ],
    [
     "Season 2",
     "predefCast(can_season2, 'regular', 'LFTF')",
     "canseason2"
    ],
    [
     "Season 3",
     "predefCast(can_season3, 'regular', 'teams')",
     "canseason3"
    ],
    [
     "Season 4",
     "predefCast(can_season4, 'regular', 'teams', 'slayers-premiere')",
     "canseason4"
    ],
    [
     "Season 5",
     "predefCast(can_season5, 'regular', 'teams', 'rosebud-premiere')",
     "canseason5"
    ],
    [
     "Season 6",
     "predefCast(can_season6, 'regular', 'teams', 'can6-premiere')",
     "canseason6"
    ],
    [
     "Season 7",
     "predefCast(can_season7, 'regular', 'teams', 'slayers-premiere')",
     "canseason7"
    ]
   ]
  ],
  [
   "Canada's Drag Race: All Stars",
   [
    [
     "Season 1",
     "predefCast(can_allstars1, 'regular', 'LFTC')",
     "canallstars1"
    ]
   ]
  ],
  [
   "Canada vs The World",
   [
    [
     "Season 1",
     "predefCast(canvstw_1, 'all-stars', 'LFTC')",
     "canvstwseason1"
    ],
    [
     "Season 2",
     "predefCast(canvstw_2, 'regular', 'LFTC')",
     "canvstwseason2"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race España",
   [
    [
     "Season 1",
     "predefCast(dres_season1, 'regular', 'top3')",
     "esseason1"
    ],
    [
     "Season 2",
     "predefCast(dres_season2, 'regular', 'top4')",
     "esseason2"
    ],
    [
     "Season 3",
     "predefCast(dres_season3, 'regular', 'teams', '', 'reinasdelacomedia')",
     "esseason3"
    ],
    [
     "Season 4",
     "predefCast(dres_season4, 'regular', 'dres4finale')",
     "esseason4"
    ],
    [
     "Season 5",
     "predefCast(ES5_Cast, 'regular', 'LFTC', 'slayers-premiere')",
     "esseason5"
    ],
    [
     "Season 6",
     "predefCast(dres_season6, 'regular', 'top4', 'par-premiere')",
     "esseason6"
    ]
   ]
  ],
  [
   "Drag Race España: All Stars",
   [
    [
     "Season 1",
     "predefCast(allstars_es1, 'all-stars', 'LFTC')",
     "esasseason1"
    ],
    [
     "Season 2",
     "predefCast(allstars_es2, 'all-stars', 'LFTC')",
     "esasseason2"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race Down Under",
   [
    [
     "Season 1",
     "predefCast(drdu_season1, 'regular', 'rankedtop4', '' , 'choose')",
     "duseason1"
    ],
    [
     "Season 2",
     "predefCast(drdu_season2, 'regular', 'top3')",
     "duseason2"
    ],
    [
     "Season 3",
     "predefCast(drdu_season3, 'regular', 'top3')",
     "duseason3"
    ],
    [
     "Season 4",
     "predefCast(drdu_season4, 'regular', 'top4', 'par-premiere')",
     "duseason4"
    ]
   ]
  ],
  [
   "Down Under vs The World",
   [
    [
     "Season 1",
     "predefCast(duvstw_1, 'all-stars', 'teams', 'duvstw-premiere')",
     "duvstwseason1"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race France",
   [
    [
     "Season 1",
     "predefCast(drfr_season1, 'regular', 'LFTF')",
     "frseason1"
    ],
    [
     "Season 2",
     "predefCast(drfr_season2, 'regular', 'teams', '', 'attentionggroup')",
     "frseason2"
    ],
    [
     "Season 3",
     "predefCast(drfr_season3, 'regular', 'teams')",
     "frseason3"
    ],
    [
     "Season 4",
     "predefCast(drfr_season4, 'regular', 'teams')",
     "frseason4"
    ]
   ]
  ],
  [
   "Drag Race France: All Stars",
   [
    [
     "Season 1",
     "predefCast(allstars_fr1, 'all-stars', 'LFTC', 'par-premiere', 'redLS')",
     "frasseason1"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race Italia",
   [
    [
     "Season 1",
     "predefCast(drita, 'regular', 'top4', 'par-premiere')",
     "itaseason1"
    ],
    [
     "Season 2",
     "predefCast(drita_season2, 'regular', 'top4')",
     "itaseason2"
    ],
    [
     "Season 3",
     "predefCast(drita_season3, 'regular', 'teams')",
     "itaseason3"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race Philippines",
   [
    [
     "Season 1",
     "predefCast(drph_season1, 'regular', 'LFTC')",
     "phseason1"
    ],
    [
     "Season 2",
     "predefCast(drph_season2, 'regular', 'drph2f', 'ph2-premiere')",
     "phseason2"
    ],
    [
     "Season 3",
     "predefCast(drph_season3, 'regular', 'teams', 'slayers-premiere')",
     "phseason3"
    ],
    [
     "Season 4",
     "predefCast(drph_season4, 'regular', 'teams', 'slayers-premiere')",
     "phseason4"
    ]
   ]
  ],
  [
   "Slaysian Royale",
   [
    [
     "Season 1",
     "predefCast(PHSR1_Cast, 'slaysian-format', 'teams')",
     "phsrseason1"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race Thailand",
   [
    [
     "Season 1",
     "predefCast(drt_season1, 'thailand', 'top3')",
     "thaseason1"
    ],
    [
     "Season 2",
     "predefCast(drt_season2, 'thailand', 'drthtop3', '' , 'returnD')",
     "thaseason2"
    ],
    [
     "Season 3",
     "predefCast(drt_season3, 'regular', 'teams', 'par-premiere')",
     "thaseason3"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race Holland",
   [
    [
     "Season 1",
     "predefCast(hol_season1, 'regular', 'teams')",
     "holseason1"
    ],
    [
     "Season 2",
     "predefCast(hol_season2, 'regular', 'top3')",
     "holseason2"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race Belgique",
   [
    [
     "Season 1",
     "predefCast(drbl_season1, 'regular', 'top3')",
     "beseason1"
    ],
    [
     "Season 2",
     "predefCast(drbl_season2, 'regular', 'maxiLFTC', 'par-premiere')",
     "beseason2"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race México",
   [
    [
     "Season 1",
     "predefCast(drmx_season1, 'regular', 'rankedtop4', 'par-premiere')",
     "mxseason1"
    ],
    [
     "Season 2",
     "predefCast(drmx_season2, 'regular', 'rankedtop4')",
     "mxseason2"
    ]
   ]
  ],
  [
   "Latina Royale",
   [
    [
     "Season 1",
     "predefCast(MXLR1_Cast, 'all-stars', 'teams', 'par-premiere')",
     "mxlrseason1"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race Brasil",
   [
    [
     "Season 1",
     "predefCast(drbr_season1, 'regular', 'rankedtop4')",
     "brseason1"
    ],
    [
     "Season 2",
     "predefCast(drbr_season2, 'regular', 'teams', 'slayers-premiere')",
     "brseason2"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race Sverige",
   [
    [
     "Season 1",
     "predefCast(drsv, 'regular', 'sverigetop3', '' , 'readingIF')",
     "svseason1"
    ]
   ]
  ]
 ],
 [
  [
   "Drag Race Germany",
   [
    [
     "Season 1",
     "predefCast(drgr, 'regular', 'top3', 'par-premiere')",
     "grseason1"
    ]
   ]
  ]
 ],
 [
  [
   "The Switch: Drag Race",
   [
    [
     "Season 1",
     "predefCast(SWITCH1_Cast, 'regular', 'top4')",
     "switchseason1"
    ],
    [
     "Season 2",
     "predefCast(SWITCH2_Cast, 'regular', 'rankedteams')",
     "switchseason2"
    ]
   ]
  ]
 ],
 [
  [
   "La Más Draga",
   [
    [
     "Season 1",
     "predefCast(LMD1_Cast, 'regularlmd', 'rankedteams', 'par-premiere')",
     "lmd1"
    ],
    [
     "Season 2",
     "predefCast(LMD2_Cast, 'regularlmd', 'rankedtop3', 'par-premiere')",
     "lmd2"
    ],
    [
     "Season 3",
     "predefCast(LMD3_Cast, 'regularlmd', 'lmd3t4', 'par-premiere', 'vote')",
     "lmd3"
    ],
    [
     "Season 4",
     "predefCast(LMD4_Cast, 'regularlmd', 'lmd4t4', 'lmd4-premiere')",
     "lmd4"
    ],
    [
     "Season 5",
     "predefCast(LMD5_Cast, 'regularlmd', 'lmd5t4', 'lmd5-premiere', 'lmd5return')",
     "lmd5"
    ],
    [
     "Season 6",
     "predefCast(LMD6_Cast, 'regularlmd', 'lmd6t4', 'par-premiere')",
     "lmd6"
    ],
    [
     "Season 7",
     "predefCast(LMD7_Cast, 'regularlmd', 'lmd5t4', 'par-premiere', 'lmd7return')",
     "lmd7"
    ],
    [
     "Season 8",
     "predefCast(LMD8_Cast, 'regularlmd', 'rankedteams', 'par-premiere')",
     "lmd8"
    ]
   ]
  ],
  [
   "La Más Draga: Solo Las Más",
   [
    [
     "Season 1",
     "predefCast(SLM1_Cast, 'slm', 'rankedteams')",
     "slm1"
    ],
    [
     "Season 2",
     "predefCast(SLM2_Cast, 'slm2', 'rankedtop5')",
     "slm2"
    ]
   ]
  ]
 ],
 [
  [
   "The Boulet Brothers' Dragula",
   [
    [
     "Season 1",
     "predefCast(BBD1_Cast, 'regulardragula', 'top3')",
     "bbd1"
    ],
    [
     "Season 2",
     "predefCast(BBD2_Cast, 'regulardragula', 'top3')",
     "bbd2"
    ],
    [
     "Season 3",
     "predefCast(BBD3_Cast, 'regulardragula', 'top3')",
     "bbd3"
    ],
    [
     "Season 4",
     "predefCast(BBD4_Cast, 'regulardragula', 'top4', 'bbd4-premiere')",
     "bbd4"
    ],
    [
     "Season 5",
     "predefCast(BBD5_Cast, 'regulardragula', 'top4', 'returnpork-premiere')",
     "bbd5"
    ],
    [
     "Season 6",
     "predefCast(BBD6_Cast, 'regulardragula', 'top3')",
     "bbd6"
    ],
    [
     "Season 7",
     "predefCast(BBD7_Cast, 'regulardragula', 'top4')",
     "bbd7"
    ]
   ]
  ],
  [
   "The Boulet Brothers' Dragula: Titans",
   [
    [
     "Season 1",
     "predefCast(TITANS1_Cast, 'titansdragula', 'drthtop3', 'returnpork-premiere')",
     "titans1"
    ],
    [
     "Season 2",
     "predefCast(TITANS2_Cast, 'titansdragula', 'top3', '', 'hellbound')",
     "titans2"
    ]
   ]
  ]
 ],
 [
  [
   "Secret Celebrity Drag Race",
   [
    [
     "Season 1",
     "predefCast(celeb1_cast, 'regular', 'top3')",
     "celeb1"
    ],
    [
     "Season 2",
     "predefCast(celeb2_cast, 'regular', 'top3')",
     "celeb2"
    ]
   ]
  ],
  [
   "Queen of the Universe",
   [
    [
     "Season 1",
     "predefCast(QOTU1_Cast, 'regular', 'rankedtop3')",
     "qotu1"
    ],
    [
     "Season 2",
     "predefCast(QOTU2_Cast, 'regular', 'rankedtop3', 'par-premiere')",
     "qotu2"
    ]
   ]
  ],
  [
   "Drag Den",
   [
    [
     "Season 1",
     "predefCast(DEN1_Cast, 'all-winners', 'rankedtop3')",
     "den1"
    ],
    [
     "Season 2",
     "predefCast(DEN2_Cast, 'regular', 'rankedtop3')",
     "den2"
    ]
   ]
  ],
  [
   "Call Me Mother",
   [
    [
     "Season 1",
     "predefCast(CMM1_Cast, 'regular', 'rankedtop3')",
     "cmm1"
    ],
    [
     "Season 2",
     "predefCast(CMM2_Cast, 'regular', 'rankedteams')",
     "cmm2"
    ]
   ]
  ],
  [
   "House of Drag",
   [
    [
     "Season 1",
     "predefCast(HOD1_Cast, 'regular', 'rankedteams', 'par-premiere')",
     "hod1"
    ],
    [
     "Season 2",
     "predefCast(HOD2_Cast, 'regular', 'rankedtop3', 'par-premiere')",
     "hod2"
    ]
   ]
  ],
  [
   "King of Drag",
   [
    [
     "Season 1",
     "predefCast(KOD1_Cast, 'regular', 'top3')",
     "kod1"
    ],
    [
     "Season 2",
     "predefCast(KOD2_Cast, 'regular', 'top3')",
     "kod2"
    ]
   ]
  ]
 ],
 []
];

  var byId = {};
  COUNTRIES.forEach(function (c, i) {
    c.index = i;
    byId[c.id] = c;
    var src = SEASONS[i] || [];
    c.items = [];
    src.forEach(function (g) {
      g[1].forEach(function (s) { c.items.push({ title: s[0], oc: s[1], key: s[2], group: g[0] }); });
    });
  });

  var tabsEl = $("#countryTabs");
  var gridEl = $("#seasonGrid");
  if (!tabsEl || !gridEl) return;
  var emptyEl = $("#seasonEmpty");
  var leftBtn = $("#tabsLeft");
  var rightBtn = $("#tabsRight");

  /* ---------- Season cards ---------- */
  var posterById = null;
  function posterFor(key) {
    if (!USE_POSTERS || !key) return "";
    if (!posterById) {
      posterById = {};
      try { (typeof imgTxtPrdf !== "undefined" ? imgTxtPrdf : []).forEach(function (p) { posterById[p.id] = p.link; }); } catch (e) {}
    }
    return posterById[key] || "";
  }

  function thumbHTML(url) {
    return url
      ? '<div class="season-thumb season-thumb--img"><img src="' + esc(url) + '" alt="" loading="lazy" /></div>'
      : '<div class="season-thumb"><svg class="icon" aria-hidden="true"><use href="#i-star"/></svg></div>';
  }

  function icon(id) { return '<svg class="icon icon--sm" aria-hidden="true"><use href="#' + id + '"/></svg>'; }

  function card(c, s, position) {
    var title = s.title;
    var featured = position === 0;
    return (
      '<article class="season-card' + (featured ? " is-featured" : "") + '">' +
        thumbHTML(posterFor(s.key)) +
        '<div class="season-body">' +
          '<div class="season-head">' +
            flagHTML(c) +
            '<div class="season-titles"><h3 class="season-title content-season-title">' + esc(title) + '</h3><p class="season-sub">' + esc(s.group) + "</p></div>" +
            (featured
              ? '<span class="season-badge">' + icon("i-flame") + 'Popular</span>'
              : '<svg class="icon icon--sm season-chev" aria-hidden="true"><use href="#i-chev-right"/></svg>') +
          "</div>" +
          '<div class="season-actions">' +
            /* the original inline handler, unchanged */
            '<button type="button" class="btn-play" data-act="play" title="Use Cast" aria-label="Play ' + esc(title) + '" onclick="' + esc(s.oc) + '">' + icon("i-play") + 'Play</button>' +
            '<button type="button" class="btn-icon-sq tr-mode-btn" data-act="tr" aria-label="Track Record Mode for ' + esc(title) + '" title="Track Record Mode">' + icon("i-edit") + '</button>' +
            '<button type="button" class="btn-icon-sq home-season-btn" data-act="home" aria-label="Open ' + esc(title) + ' on Home with this cast and settings" title="Open on Home with this cast and settings">' + icon("i-sliders") + '</button>' +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  /* Custom casts: same buttons/handlers as the real predef page (simulate, track record, rename, delete) */
  function customList() {
    try { return Array.isArray(allCustomCasts) ? allCustomCasts : []; } catch (e) { return []; }
  }

  function customCard(c, cast, index, position) {
    var name = cast && cast.name ? String(cast.name) : "Custom cast " + (index + 1);
    var count = cast && Array.isArray(cast.cast) ? cast.cast.length : 0;
    var featured = position === 0;
    return (
      '<article class="season-card season-card--custom' + (featured ? " is-featured" : "") + '">' +
        thumbHTML("") +
        '<div class="season-body">' +
          '<div class="season-head">' +
            flagHTML(c) +
            '<div class="season-titles"><h3 class="season-title content-season-title">' + esc(name) + '</h3><p class="season-sub">' + count + (count === 1 ? " contestant" : " contestants") + "</p></div>" +
            '<svg class="icon icon--sm season-chev" aria-hidden="true"><use href="#i-chev-right"/></svg>' +
          "</div>" +
          '<div class="season-actions season-actions--custom">' +
            '<button type="button" class="btn-play" title="Simulate" aria-label="Simulate ' + esc(name) + '" onclick="simulateCustomCast(' + index + ')">' + icon("i-play") + 'Play</button>' +
            '<button type="button" class="btn-icon-sq tr-mode-btn" title="Track Record Mode" aria-label="Track Record Mode for ' + esc(name) + '" onclick="openTrackRecordModeFromCustomCast(' + index + ')">' + icon("i-edit") + '</button>' +
            '<button type="button" class="btn-icon-sq" title="Rename" aria-label="Rename ' + esc(name) + '" onclick="editCustomCast(' + index + ')">' + icon("i-gear") + '</button>' +
            '<button type="button" class="btn-icon-sq btn-icon-sq--danger danger" title="Delete" aria-label="Delete ' + esc(name) + '" onclick="deleteCustomCast(' + index + ')">' + icon("i-trash") + '</button>' +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  /* ---------- Rendering ---------- */
  var active = COUNTRIES[0].id;

  function renderTabs() {
    tabsEl.innerHTML = COUNTRIES.map(function (c) {
      return (
        '<button type="button" class="country-tab" role="tab" id="tab-' + c.id + '" data-id="' + c.id + '" aria-selected="false">' +
          flagHTML(c) + "<span>" + esc(c.label) + "</span>" +
        "</button>"
      );
    }).join("");
  }

  function renderGrid() {
    var c = byId[active];
    var out = [];

    if (c.custom) {
      customList().forEach(function (cast, i) { out.push(customCard(c, cast, i, out.length)); });
      emptyEl.innerHTML = 'No custom casts yet. Build one on the <a href="custom.html">Custom</a> page and it will show up here.';
    } else {
      /* tabs with more than one show (UK + UK vs The World, Canada + All Stars + vs The World, ...) get a divider per show */
      var groups = [];
      c.items.forEach(function (s) {
        var g = groups.length && groups[groups.length - 1].name === s.group ? groups[groups.length - 1] : null;
        if (!g) { g = { name: s.group, items: [] }; groups.push(g); }
        g.items.push(s);
      });
      var divided = groups.length > 1;
      groups.forEach(function (g) {
        if (divided) {
          out.push(
            '<div class="season-divider" role="presentation">' +
              '<span class="season-divider__title">' + esc(g.name) + "</span>" +
              '<span class="season-divider__line"></span>' +
            "</div>"
          );
        }
        g.items.forEach(function (s) { out.push(card(c, s, out.length)); });
      });
    }

    gridEl.innerHTML = out.join("");
    gridEl.setAttribute("aria-labelledby", "tab-" + c.id);
    emptyEl.hidden = out.length > 0;
  }

  function updateArrows() {
    var max = tabsEl.scrollWidth - tabsEl.clientWidth;
    leftBtn.hidden = tabsEl.scrollLeft <= 4;
    rightBtn.hidden = tabsEl.scrollLeft >= max - 4;
  }

  function selectCountry(id, opts) {
    if (!byId[id]) id = COUNTRIES[0].id;
    active = id;
    var tabs = tabsEl.querySelectorAll(".country-tab");
    Array.prototype.forEach.call(tabs, function (t) {
      var on = t.getAttribute("data-id") === id;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (on && !(opts && opts.noScroll)) {
        var target = t.offsetLeft - (tabsEl.clientWidth - t.offsetWidth) / 2;
        tabsEl.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
      }
    });
    renderGrid();
    /* No URL hash here: the real index.js reads any #hash as a live-share room id and redirects to watch.html. */
    if (!(opts && opts.noRemember)) {
      try { sessionStorage.setItem("ss.seasonsTab", id); } catch (e) {}
    }
  }

  /* ---------- Events ---------- */
  tabsEl.addEventListener("click", function (e) {
    var t = e.target.closest(".country-tab");
    if (t) {
      selectCountry(t.getAttribute("data-id"));
    }
  });

  tabsEl.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    var i = byId[active].index + (e.key === "ArrowRight" ? 1 : -1);
    i = Math.max(0, Math.min(COUNTRIES.length - 1, i));
    selectCountry(COUNTRIES[i].id);
    var t = $("#tab-" + COUNTRIES[i].id);
    if (t) t.focus();
    e.preventDefault();
  });

  tabsEl.addEventListener("scroll", updateArrows, { passive: true });
  window.addEventListener("resize", updateArrows);
  leftBtn.addEventListener("click", function () { tabsEl.scrollBy({ left: -Math.max(240, tabsEl.clientWidth * 0.6), behavior: "smooth" }); });
  rightBtn.addEventListener("click", function () { tabsEl.scrollBy({ left: Math.max(240, tabsEl.clientWidth * 0.6), behavior: "smooth" }); });

  /* Play / custom-cast buttons use their own inline onclick (the real handlers). Only these two need help: */
  gridEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var cardEl = b.closest(".season-card");
    var playBtn = cardEl && cardEl.querySelector('[data-act="play"]');
    if (!playBtn) return;

    if (b.getAttribute("data-act") === "tr") {
      if (typeof openTrackRecordModeFromButton === "function") openTrackRecordModeFromButton(playBtn, cardEl);
      else toast("Track Record Mode isn't ready yet.");
    } else if (b.getAttribute("data-act") === "home") {
      if (typeof window.saveHomeSettingsFromPredefButton === "function" && window.saveHomeSettingsFromPredefButton(playBtn)) {
        window.location.href = "index.html";
      } else {
        toast("Could not load this cast and season settings.");
      }
    }
  });

  /* ---------- Init (after the real deferred scripts have run, so allCustomCasts exists) ---------- */
  function init() {
    renderTabs();
    var saved = "";
    try { saved = sessionStorage.getItem("ss.seasonsTab") || ""; } catch (e) {}
    var start = byId[saved] ? saved : active;
    selectCountry(start, { noRemember: true, noScroll: start === active });
    updateArrows();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  /* index.js rewrites document.title for known page names (it still calls this page "predef"); set ours once it has run. */
  window.addEventListener("load", function () { document.title = "Seasons - Simulator Superstars"; });
})();
