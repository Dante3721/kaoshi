/* 中级+CPA 备考 PWA — 主逻辑 */
(function () {
  'use strict';

  var P = window.PLAN;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ============================================================ 工具
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  function d2s(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function s2d(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function daysBetween(a, b) { return Math.round((s2d(b) - s2d(a)) / 86400000); }
  function md(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function stars(n) { return '★'.repeat(n); }
  function starCount(s) { return (s.match(/★/g) || []).length; }

  function weeksIn(startISO, endISO, sameWeek) {
    var s = s2d(startISO), e = s2d(endISO), w = [s];
    var step = sameWeek ? 7 : 1;
    var cur = sameWeek ? (function () { var x = new Date(s.getTime()); x.setDate(x.getDate() + 7); return x; })() : addDays(s, 1);
    while (cur <= e) { w.push(cur); cur = addDays(cur, step); }
    return w;
  }

  // ============================================================ 存储
  var KEY = 'zkplan.v1';
  var DEFAULT = {
    checkins: {},          // 'YYYY-MM-DD': { routine:{id:bool}, hours:number, note:string }
    weeks: {},             // 'w': {done:bool, note:string}
    chapters: {},          // 'sid:ch': {r1:'', r2:'', done:bool}
    errors: [],            // {id,date,subject,chapter,type,note,fix,done,recur}
    settings: {
      morning: '06:30', noon: '12:30', evening: '20:00',
      target: 15, examDate: P.meta.cpaExam, examDate2: P.meta.zjExam
    }
  };
  var S = load();
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT));
      var o = JSON.parse(raw);
      var base = JSON.parse(JSON.stringify(DEFAULT));
      base.checkins = o.checkins || {};
      base.weeks = o.weeks || {};
      base.chapters = o.chapters || {};
      base.errors = o.errors || [];
      Object.assign(base.settings, o.settings || {});
      return base;
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULT)); }
  }
  var saveTimer = null;
  function save(now) {
    window.__zkState = S;                 // 供自动化测试读取内部状态
    if (now) { localStorage.setItem(KEY, JSON.stringify(S)); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { localStorage.setItem(KEY, JSON.stringify(S)); }, 200);
  }
  function todayRec(ds) {
    if (!S.checkins[ds]) S.checkins[ds] = { routine: {}, hours: 0, note: '' };
    return S.checkins[ds];
  }
  function toast(msg) {
    (toast.log = toast.log || []).push(msg);   // 供测试读取
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 1900);
  }

  // ============================================================ 周定位
  var START = s2d(P.meta.start);
  function weekIndexFor(d) {
    var diff = Math.floor((d - START) / 86400000);
    if (diff < 0) return 0;
    return Math.min(P.meta.weeks, Math.floor(diff / 7) + 1);
  }
  function weekByNo(n) { return P.weeks[n - 1]; }
  var TODAY = today();
  var CUR_W = weekIndexFor(TODAY);

  // ============================================================ 本周安排（每天学什么）
  var ROT = {
    1: { kj: 'CPA会计', cg: 'CPA财管', jjf: null },
    2: { kj: 'CPA会计', cg: 'CPA财管', jjf: null },
    3: { kj: 'CPA会计', cg: 'CPA财管', jjf: 'CPA经济法' },
    4: { kj: 'CPA会计', cg: 'CPA财管', jjf: 'CPA经济法' },
    5: { kj: 'CPA会计', cg: 'CPA财管', jjf: 'CPA经济法' }
  };
  var ROT_TXT = {
    1: 'CPA会计为主（地基期，先把会计打牢）+ CPA财管；本阶段先不碰经济法',
    2: 'CPA会计 + CPA财管（财管基础篇收口）；本阶段先不碰经济法',
    3: 'CPA会计 + CPA财管 + CPA经济法（本周起三科轮转，经济法放碎片时间）',
    4: 'CPA会计 + CPA财管 + CPA经济法（开始限时训练）',
    5: '三科主观题专项 + 中级专用内容（中级与CPA差异章节优先）'
  };
  function rotationFor(w) {
    if (w <= 2) return 1;
    if (w <= 7) return 3;
    if (w <= 13) return 2;
    if (w <= 21) return 3;
    if (w <= 30) return 4;
    return 5;
  }

  function isoWeek(d) {
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    var firstThu = new Date(t.getFullYear(), 0, 4);
    firstThu.setDate(firstThu.getDate() + 3 - ((firstThu.getDay() + 6) % 7));
    return 1 + Math.round((t - firstThu) / 604800000);
  }

  // 从本周目标文本里抽取"第N章" → 关联章节清单
  function chaptersMentioned(text, sid) {
    var out = [], list = P.chapters[sid] ? P.chapters[sid].items : [];
    var seen = {};
    var re = /第\s*(\d+)\s*章/g, m;
    while ((m = re.exec(text))) {
      var n = +m[1];
      for (var i = 0; i < list.length; i++) {
        var cn = parseInt(String(list[i].ch).replace(/[^\d]/g, ''), 10);
        if (cn === n && !seen[n]) { seen[n] = 1; out.push(list[i]); }
      }
    }
    return out;
  }

  // ============================================================ 视图：今日
  function nextMilestone() {
    for (var i = 0; i < P.milestones.length; i++) {
      if (s2d(P.milestones[i].date) >= TODAY) return P.milestones[i];
    }
    return null;
  }
  function nextExam() {
    for (var i = 0; i < P.exams.length; i++) {
      if (s2d(P.exams[i].date) >= TODAY) return P.exams[i];
    }
    return null;
  }

  function viewToday() {
    $('#tbTitle').textContent = '今日';
    $('#tbSub').textContent = md(TODAY) + ' 周' + WD[TODAY.getDay()] +
      (CUR_W >= 1 ? ' · 第' + CUR_W + '周（共' + P.meta.weeks + '周）' : ' · 备考未开始');
    var cpaDays = daysBetween(d2s(TODAY), P.meta.cpaExam);
    var zjDays = daysBetween(d2s(TODAY), P.meta.zjExam);
    $('#tbRight').innerHTML =
      (cpaDays >= 0 ? '<span class="pill acc">CPA ' + cpaDays + '天</span>' : '') +
      (zjDays >= 0 ? '<span class="pill">中级 ' + zjDays + '天</span>' : '');

    // Hero
    var wk = CUR_W >= 1 ? weekByNo(CUR_W) : null;
    var rec = todayRec(d2s(TODAY));
    var dh = Object.keys(rec.routine).filter(function (k) { return rec.routine[k]; }).length;
    var wREC = S.checkins, weekHours = 0;
    if (CUR_W >= 1) {
      weeksIn(wk.start, wk.end, false).forEach(function (d) {
        var r = wREC[d2s(d)]; if (r) weekHours += (+r.hours || 0);
      });
    }
    var pct = Math.min(100, Math.round(weekHours / S.settings.target * 100));
    $('#heroCard').innerHTML =
      '<div class="between"><div><div class="tiny">本周（第' + CUR_W + '周）已完成</div>' +
      '<div style="font-size:26px;font-weight:800;margin:2px 0 0">' + weekHours.toFixed(1) +
      '<span style="font-size:14px;color:var(--txt2);font-weight:600"> / ' + S.settings.target + ' 小时</span></div></div>' +
      '<div style="text-align:right"><div class="pill ' + (pct >= 100 ? 'ok' : 'acc') + '">' + pct + '%</div>' +
      '<div class="tiny" style="margin-top:6px">今日完成 ' + dh + '/5</div></div></div>' +
      '<div class="bar" style="margin-top:12px"><i style="width:' + pct + '%"></i></div>' +
      (wk ? '<div class="hr"></div><div class="tiny">本周目标</div>' +
        '<div style="font-size:13.5px;font-weight:600;margin-top:4px;line-height:1.45">' +
        esc(wk.goal) + '</div>' : '');

    // 今日任务清单
    var isWeekend = TODAY.getDay() === 0 || TODAY.getDay() === 6;
    var blocks = P.daily.slice();
    if (isWeekend) {
      blocks.push(P.weekend[0], P.weekend[1]);
    }
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    var html = '<h2>今日任务' + (isWeekend ? '（周末）' : '') + '</h2>';
    blocks.forEach(function (b) {
      var isWk = (b.id === 'sat' || b.id === 'sun');
      var show = !isWk || (b.id === 'sat' ? TODAY.getDay() === 6 : TODAY.getDay() === 0);
      if (!show) return;
      var t = isWk ? b.time.replace('周六 ', '').replace('周日 ', '') : b.time;
      var tp = t.split(':'), bm = (+tp[0]) * 60 + (+tp[1]);
      var done = !!rec.routine[b.id];
      var cls = 'check' + (done ? ' done' : '');
      html += '<div class="' + cls + '" data-check="' + b.id + '">' +
        '<div class="box">✓</div><div class="cbody">' +
        '<div class="between"><div class="ct">' + b.icon + ' ' + esc(b.title) + '</div>' +
        '<div class="ctime">' + (isWk ? (TODAY.getDay() === 6 ? '周六' : '周日') + ' ' : '') + t +
        (bm <= nowMin && !done ? ' <span style="color:var(--warn)">●</span>' : '') + '</div></div>' +
        '<div class="cd">' + esc(b.desc) + '</div></div></div>';
    });
    html += '<div class="hr"></div><div class="row" style="justify-content:space-between">' +
      '<div><div class="tiny">今日实际学习</div>' +
      '<div style="font-size:17px;font-weight:800">' + (+rec.hours || 0).toFixed(1) + ' h</div></div>' +
      '<div class="stepper"><button data-h="-0.5">−</button><div class="val">0.5h</div>' +
      '<button data-h="0.5">＋</button></div></div>' +
      '<div class="btnblock"><button class="btn sm" data-quick="1">+1h</button>' +
      '<button class="btn sm" data-quick="2">+2h</button>' +
      '<button class="btn sm bad" data-quick="reset">清零</button>' +
      '<button class="btn sm" data-note="1">记一笔</button></div>';
    $('#todayCard').innerHTML = html;

    // 本周学什么
    var rot = rotationFor(CUR_W);
    var fh = '<h2>本周学什么</h2><div class="muted">' + esc(ROT_TXT[rot]) + '</div>';
    if (wk) {
      fh += '<div class="hr"></div><h3>CPA 会计</h3><div class="subj-c">' + esc(wk.kj || '—') + '</div>' +
        '<h3>CPA 财务成本管理</h3><div class="subj-c">' + esc(wk.cg || '—') + '</div>' +
        '<h3>CPA 经济法</h3><div class="subj-c">' + esc(wk.jjf || '—') + '</div>' +
        '<h3>中级（补差异）</h3><div class="subj-c">' + esc(wk.sw || '—') + '</div>' +
        '<div class="btnblock"><button class="btn sm" data-nav="week">看本周全部安排 →</button></div>';
    }
    $('#focusCard').innerHTML = fh;

    // 下一个关键节点
    var ms = nextMilestone(), ex = nextExam(), nh = '<h2>下一个关键节点</h2>';
    if (ms) {
      var dd = daysBetween(d2s(TODAY), ms.date);
      nh += '<div class="between" style="align-items:flex-start">' +
        '<div style="flex:1"><div style="font-weight:700;font-size:14px">' + esc(ms.title) + '</div>' +
        '<div class="muted" style="margin-top:4px">' + esc(ms.desc) + '</div></div>' +
        '<span class="pill ' + (dd <= 7 ? 'warn' : 'acc') + '">' + (dd === 0 ? '今天' : dd + '天后') + '</span></div>';
    }
    if (ex) {
      nh += '<div class="hr"></div><div class="tiny">最近一场考试</div>' +
        '<div style="font-weight:700;font-size:14px">★ ' + esc(ex.name) + '　' + ex.date + ' ' +
        ex.start + '—' + ex.end + '（' + ex.dur + '）</div>';
    }
    $('#nextCard').innerHTML = nh;
  }

  // ============================================================ 视图：本周
  function viewWeek() {
    var wk = CUR_W >= 1 ? weekByNo(CUR_W) : null;
    $('#tbTitle').textContent = '本周';
    if (!wk) {
      $('#tbSub').textContent = '备考尚未开始';
      $('#weekBody').innerHTML = '<div class="card"><div class="empty">计划从 ' + P.meta.start +
        ' 开始，共 ' + P.meta.weeks + ' 周。</div></div>';
      return;
    }
    var ph = P.phases.filter(function (p) { return p.from <= CUR_W && CUR_W <= p.to; })[0];
    $('#tbSub').textContent = '第' + CUR_W + '周 · ' + wk.start + ' → ' + wk.end;

    var rot = rotationFor(CUR_W);
    var h = '<div class="card"><h2>第' + CUR_W + '周</h2>' +
      '<div class="kv"><span class="k">日期</span><span class="v">' + wk.start + ' → ' + wk.end + '</span></div>' +
      '<div class="kv"><span class="k">阶段</span><span class="v">' + esc(wk.phase) + '</span></div>' +
      '<div class="kv"><span class="k">本周关键动作</span></div>' +
      '<div style="font-weight:600">' + esc(wk.goal) + '</div>' +
      (ph ? '<div class="hr"></div><div class="tiny">阶段目标</div><div class="muted">' + esc(ph.goal) + '</div>' : '') +
      '</div>';

    // 七天安排
    var days = weeksIn(wk.start, wk.end, false);
    var rec = S.checkins;
    h += '<div class="card"><h2>七天安排</h2><div class="tl">';
    days.forEach(function (d) {
      var ds = d2s(d), dow = d.getDay(), isWk = (dow === 0 || dow === 6);
      var r = rec[ds] || { routine: {}, hours: 0 };
      var doneN = Object.keys(r.routine).filter(function (k) { return r.routine[k]; }).length;
      var isToday = ds === d2s(TODAY);
      var isPast = d < TODAY;
      var focus = '';
      if (isWk) {
        focus = dow === 6 ? '④ 周六攻坚 4h + 周测' : '⑤ 周日 4h 限时机考模拟 + 复盘';
      } else {
        var i = (dow + 6) % 5; // 周一=0
        var parts = [];
        if (i === 0 || i === 2 || i === 4) parts.push('CPA会计');
        if (i === 1 || i === 3) parts.push('CPA财管');
        if (rot >= 3 && (i === 0 || i === 3)) parts.push('CPA经济法');
        focus = '③ 新课+做题 2h（' + parts.join(' + ') + '）';
      }
      h += '<div class="tl-item ' + (isToday ? 'now' : (isPast ? 'past' : '')) + '">' +
        '<div class="tl-dot"></div><div style="flex:1">' +
        '<div class="between"><div style="font-weight:700;font-size:13.5px">' +
        (d.getMonth() + 1) + '/' + d.getDate() + ' 周' + WD[dow] +
        (isToday ? '<span class="now-tag">今天</span>' : '') + '</div>' +
        '<div class="tiny">' + doneN + ' 项 · ' + (+r.hours || 0).toFixed(1) + 'h</div></div>' +
        '<div class="muted" style="margin-top:2px">' + esc(focus) + '</div></div></div>';
    });
    h += '</div><div class="btnblock"><button class="btn sm pri" data-nav="checkin">去打卡 →</button>' +
      '<button class="btn sm" data-detail="' + CUR_W + '">本周章节明细</button></div></div>';

    // 阶段进度
    h += '<div class="card"><h2>阶段进度</h2>';
    P.phases.forEach(function (p) {
      var total = Math.min(p.to, P.meta.weeks) - p.from + 1;
      var done = Math.max(0, Math.min(CUR_W, p.to) - p.from + 1);
      var pct = Math.round(done / total * 100);
      h += '<div style="margin-bottom:10px"><div class="between" style="margin-bottom:4px">' +
        '<span style="font-size:12.5px;font-weight:600">' + esc(p.name) + '</span>' +
        '<span class="tiny">第' + p.from + '—' + p.to + '周</span></div>' +
        '<div class="bar sm"><i style="width:' + pct + '%"></i></div></div>';
    });
    h += '</div>';
    $('#weekBody').innerHTML = h;
  }

  // ============================================================ 视图：计划
  var planFilter = 'all';
  function viewPlan() {
    $('#tbTitle').textContent = '46 周计划';
    $('#tbSub').textContent = P.meta.start + ' → ' + P.meta.end;
    $('#tbRight').innerHTML = '<span class="pill">' +
      Object.keys(S.weeks).filter(function (k) { return S.weeks[k].done; }).length +
      '/' + P.meta.weeks + ' 周完成</span>';

    var chips = '<button class="chip' + (planFilter === 'all' ? ' on' : '') + '" data-phase="all">全部</button>' +
      '<button class="chip' + (planFilter === 'cur' ? ' on' : '') + '" data-phase="cur">当前周附近</button>';
    P.phases.forEach(function (p, i) {
      chips += '<button class="chip' + (planFilter === String(i) ? ' on' : '') +
        '" data-phase="' + i + '">' + esc(p.name.split('｜')[1] || p.name) + '</button>';
    });
    $('#phaseChips').innerHTML = chips;

    var h = '';
    P.weeks.forEach(function (w) {
      if (planFilter === 'cur' && Math.abs(w.w - CUR_W) > 3) return;
      if (/^\d+$/.test(planFilter)) {
        var p = P.phases[+planFilter];
        if (w.w < p.from || w.w > Math.min(p.to, P.meta.weeks)) return;
      }
      var done = S.weeks[w.w] && S.weeks[w.w].done;
      var blocked = Object.keys(S.chapters).filter(function (k) {
        return k.indexOf(':') > 0; }).length; // 仅用于说明
      h += '<div class="wk' + (w.w === CUR_W ? ' cur' : '') + '" data-week="' + w.w + '">' +
        '<div class="wk-h"><div class="wk-n">W' + w.w + '</div><div class="wk-g">' +
        esc(w.goal) + (w.w === CUR_W ? '<span class="now-tag">本周</span>' : '') +
        '<div class="wk-m">' + w.start.slice(5) + ' — ' + w.end.slice(5) +
        '　·　' + esc(w.phase.split('｜')[0]) + (done ? '　·　✅ 已完成' : '') + '</div>' +
        '</div><div style="color:var(--txt3);font-size:18px">›</div></div>' +
        '<div class="wk-b">' + weekDetailHTML(w) +
        '<div class="btnblock"><button class="btn sm ' + (done ? 'ok' : '') +
        '" data-wdone="' + w.w + '">' + (done ? '✓ 已标记完成' : '标记本周完成') + '</button></div>' +
        '</div></div>';
    });
    $('#weekList').innerHTML = h || '<div class="card"><div class="empty">没有匹配的周</div></div>';
  }

  function weekDetailHTML(w) {
    var h = '';
    [['kj', 'CPA 会计'], ['cg', 'CPA 财务成本管理'], ['jjf', 'CPA 经济法'], ['sw', '中级（补差异）']]
      .forEach(function (pair) {
        var v = w[pair[0]];
        if (!v) return;
        h += '<div class="subj"><div class="subj-t">' + pair[1] + '</div>' +
          '<div class="subj-c">' + esc(v) + '</div>';
        var sid = pair[0] === 'sw' ? 'zjsw' : pair[0];
        var cs = chaptersMentioned(v, sid);
        if (cs.length) {
          h += '<div class="chips" style="padding-top:6px">';
          cs.forEach(function (c) {
            var key = sid + ':' + c.ch, st = S.chapters[key] || {};
            h += '<button class="chip' + (st.done ? ' on' : '') + '" data-chap="' + key + '">' +
              (st.done ? '✓ ' : '') + esc(c.ch) + ' ' + esc(c.name.slice(0, 10)) +
              ' ' + stars(starCount(c.star)) + '</button>';
          });
          h += '</div>';
        }
        h += '</div>';
      });
    return h || '<div class="muted">本周无单独安排（考试周或冲刺周）</div>';
  }

  // ============================================================ 视图：打卡
  function viewCheckin() {
    $('#tbTitle').textContent = '打卡';
    var wk = CUR_W >= 1 ? weekByNo(CUR_W) : null;
    $('#tbSub').textContent = wk ? '第' + CUR_W + '周 · ' + wk.start + ' → ' + wk.end :
      '计划从 ' + P.meta.start + ' 开始';

    // 本周热力图
    var h = '<div class="card"><h2>本周打卡</h2><div class="heat">';
    ['一', '二', '三', '四', '五', '六', '日'].forEach(function (x) {
      h += '<div class="hd">' + x + '</div>';
    });
    var weekHours = 0, weekDays = 0;
    if (wk) {
      var days = weeksIn(wk.start, wk.end, false);
      days.forEach(function (d) {
        var ds = d2s(d), r = S.checkins[ds];
        var hrs = r ? (+r.hours || 0) : 0;
        weekHours += hrs;
        if (hrs > 0) weekDays++;
        var lv = hrs <= 0 ? 'zero' : (hrs < 1.5 ? 'l1' : (hrs < 3 ? 'l2' : 'l3'));
        var isToday = ds === d2s(TODAY);
        var miss = d < TODAY && hrs <= 0;
        h += '<div class="cell ' + lv + (isToday ? ' today' : '') + (miss ? ' miss' : '') +
          '" data-day="' + ds + '">' + (hrs > 0 ? hrs.toFixed(1) : d.getDate()) + '</div>';
      });
    }
    h += '</div><div class="hr"></div>' +
      '<div class="kv"><span class="k">本周累计</span><span class="v">' + weekHours.toFixed(1) + ' h / ' +
      S.settings.target + ' h</span></div>' +
      '<div class="kv"><span class="k">有效学习天数</span><span class="v">' + weekDays + ' / 7 天</span></div>' +
      '<div class="bar" style="margin-top:8px"><i style="width:' +
      Math.min(100, Math.round(weekHours / S.settings.target * 100)) + '%"></i></div>' +
      '<div class="btnblock"><button class="btn sm pri" data-day="' + d2s(TODAY) + '">给今天记学时</button>' +
      '<button class="btn sm" data-month="1">查看整月/全程</button></div></div>';

    // 全部 46 周热力图
    h += '<div class="card"><h2>全程打卡（46 周）</h2>' +
      '<div class="tiny" style="margin-bottom:6px">每格 = 1 天，颜色越深学时越多。点格子可补记。</div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">';
    ['一', '二', '三', '四', '五', '六', '日'].forEach(function (x) {
      h += '<div class="hd">' + x + '</div>';
    });
    var allDays = weeksIn(P.meta.start, P.meta.end, false);
    // 补齐首周之前的空位
    var firstDow = s2d(P.meta.start).getDay();
    var pad = (firstDow + 6) % 7;
    for (var i = 0; i < pad; i++) h += '<div></div>';
    allDays.forEach(function (d) {
      var ds = d2s(d), r = S.checkins[ds];
      var hrs = r ? (+r.hours || 0) : 0;
      var lv = hrs <= 0 ? 'zero' : (hrs < 1.5 ? 'l1' : (hrs < 3 ? 'l2' : 'l3'));
      var isToday = ds === d2s(TODAY);
      h += '<div class="cell ' + lv + (isToday ? ' today' : '') + '" data-day="' + ds +
        '" style="aspect-ratio:1;border-radius:4px;font-size:0"></div>';
    });
    h += '</div></div>';

    // 章节进度
    h += '<div class="card"><div class="between"><h2>章节进度</h2>' +
      '<span class="pill">' + countChaptersDone() + ' / ' + countChaptersTotal() + '</span></div>';
    Object.keys(P.chapters).forEach(function (sid) {
      var grp = P.chapters[sid];
      var done = grp.items.filter(function (c) { return (S.chapters[sid + ':' + c.ch] || {}).done; }).length;
      var pct = Math.round(done / grp.items.length * 100);
      h += '<div style="margin-bottom:12px"><div class="between" style="margin-bottom:4px">' +
        '<span style="font-size:13px;font-weight:600">' + esc(grp.label) + '</span>' +
        '<span class="tiny">' + done + '/' + grp.items.length + '　' + pct + '%</span></div>' +
        '<div class="bar sm"><i style="width:' + pct + '%"></i></div></div>';
    });
    h += '<div class="btnblock"><button class="btn sm" data-nav="plan">去计划页勾章节 →</button></div></div>';
    $('#checkinCard').innerHTML = h;
    $('#chapterCard').innerHTML = '';
  }

  function countChaptersTotal() {
    return Object.keys(P.chapters).reduce(function (a, k) { return a + P.chapters[k].items.length; }, 0);
  }
  function countChaptersDone() {
    return Object.keys(S.chapters).filter(function (k) { return S.chapters[k].done; }).length;
  }

  // ============================================================ 视图：错题
  var errFilter = { subject: 'all', type: 'all', open: false };
  var SUBJECTS = ['CPA会计', 'CPA财管', 'CPA经济法', '中级实务', '中级财管', '中级经济法'];
  var TYPES = ['概念不清', '公式记错', '计算失误', '审题偏差', '法条记混'];

  function viewErrors() {
    $('#tbTitle').textContent = '错题本';
    var open = S.errors.filter(function (e) { return !e.done; }).length;
    $('#tbSub').textContent = '共 ' + S.errors.length + ' 条，未攻克 ' + open + ' 条';
    $('#tbRight').innerHTML = '<button class="btn sm pri" data-adderr="1">＋ 记错题</button>';

    var h = '<div class="chips">' +
      '<button class="chip' + (errFilter.subject === 'all' ? ' on' : '') + '" data-ef="subject:all">全部科目</button>';
    SUBJECTS.forEach(function (s) {
      var n = S.errors.filter(function (e) { return e.subject === s; }).length;
      if (!n) return;
      h += '<button class="chip' + (errFilter.subject === s ? ' on' : '') + '" data-ef="subject:' + s + '">' +
        s + ' ' + n + '</button>';
    });
    h += '</div><div class="chips">' +
      '<button class="chip' + (errFilter.type === 'all' ? ' on' : '') + '" data-ef="type:all">全部错因</button>';
    TYPES.forEach(function (t) {
      var n = S.errors.filter(function (e) { return e.type === t; }).length;
      h += '<button class="chip' + (errFilter.type === t ? ' on' : '') + '" data-ef="type:' + t + '">' +
        t + ' ' + n + '</button>';
    });
    h += '<button class="chip' + (errFilter.open ? ' on' : '') + '" data-ef="open:1">只看未攻克</button></div>';

    var list = S.errors.filter(function (e) {
      if (errFilter.subject !== 'all' && e.subject !== errFilter.subject) return false;
      if (errFilter.type !== 'all' && e.type !== errFilter.type) return false;
      if (errFilter.open && e.done) return false;
      return true;
    }).sort(function (a, b) { return b.id - a.id; });

    if (!list.length) {
      h += '<div class="card"><div class="empty">' +
        (S.errors.length ? '没有匹配的错题' : '还没有错题记录。<br>做完题随手记一条，比抄整道题有用。') +
        '</div></div>';
    }
    list.forEach(function (e) {
      h += '<div class="err' + (e.done ? ' done' : '') + '">' +
        '<div class="err-h"><span class="tag k">' + esc(e.subject) + '</span>' +
        (e.chapter ? '<span class="tag">' + esc(e.chapter) + '</span>' : '') +
        '<span class="tag w">' + esc(e.type) + '</span>' +
        (e.recur > 0 ? '<span class="tag w">复发 ' + e.recur + ' 次</span>' : '') +
        '<span class="tiny" style="margin-left:auto">' + esc(e.date) + '</span></div>' +
        (e.note ? '<div class="err-b">' + esc(e.note) + '</div>' : '') +
        (e.fix ? '<div class="err-b" style="color:var(--ok);margin-top:6px">→ ' + esc(e.fix) + '</div>' : '') +
        '<div class="btnblock">' +
        '<button class="btn sm ' + (e.done ? 'ok' : '') + '" data-edone="' + e.id + '">' +
        (e.done ? '✓ 已攻克' : '标记攻克') + '</button>' +
        '<button class="btn sm" data-erecur="' + e.id + '">又错了</button>' +
        '<button class="btn sm" data-eedit="' + e.id + '">编辑</button>' +
        '<button class="btn sm bad" data-edel="' + e.id + '">删除</button></div></div>';
    });
    $('#errorsBody').innerHTML = h;
  }

  // ============================================================ 视图：统计
  function viewStats() {
    $('#tbTitle').textContent = '统计';
    var doneW = Object.keys(S.weeks).filter(function (k) { return S.weeks[k].done; }).length;
    var totalH = 0, days = 0, byWeek = [];
    weeksIn(P.meta.start, P.meta.end, false).forEach(function (d) {
      var r = S.checkins[d2s(d)]; var hrs = r ? (+r.hours || 0) : 0;
      if (hrs > 0) { totalH += hrs; days++; }
    });
    P.weeks.forEach(function (w) {
      var s = 0;
      weeksIn(w.start, w.end, false).forEach(function (d) {
        var r = S.checkins[d2s(d)]; if (r) s += (+r.hours || 0);
      });
      byWeek.push(s);
    });
    var avg = days ? (totalH / days) : 0;
    var onTrack = byWeek.filter(function (x) { return x >= S.settings.target; }).length;
    var totalDays = Math.max(1, daysBetween(P.meta.start, P.meta.end) + 1);

    $('#tbSub').textContent = '累计 ' + totalH.toFixed(1) + ' 小时 · 学习 ' + days + ' 天';
    $('#tbRight').innerHTML = '<span class="pill ' + (avg >= 2 ? 'ok' : 'warn') + '">日均 ' +
      avg.toFixed(1) + 'h</span>';

    var h = '<div class="card"><h2>总览</h2>' +
      '<div class="kv"><span class="k">累计学习时长</span><span class="v">' + totalH.toFixed(1) + ' h</span></div>' +
      '<div class="kv"><span class="k">有效学习天数</span><span class="v">' + days + ' 天</span></div>' +
      '<div class="kv"><span class="k">日均（按有效天）</span><span class="v">' + avg.toFixed(1) + ' h</span></div>' +
      '<div class="kv"><span class="k">达标周数（≥' + S.settings.target + 'h）</span><span class="v">' +
      onTrack + ' / ' + P.meta.weeks + ' 周</span></div>' +
      '<div class="kv"><span class="k">已标记完成的周</span><span class="v">' + doneW + ' / ' +
      P.meta.weeks + ' 周</span></div>' +
      '<div class="kv"><span class="k">错题总数 / 未攻克</span><span class="v">' + S.errors.length + ' / ' +
      S.errors.filter(function (e) { return !e.done; }).length + '</span></div>' +
      '<div class="kv"><span class="k">章节完成</span><span class="v">' + countChaptersDone() + ' / ' +
      countChaptersTotal() + '</span></div></div>';

    // 每周学时柱状图
    var max = Math.max(S.settings.target, Math.max.apply(null, byWeek.concat([1])));
    h += '<div class="card"><h2>每周学时</h2><div class="chart" style="max-height:260px;overflow-y:auto">';
    byWeek.forEach(function (v, i) {
      var pct = Math.round(v / max * 100);
      var cur = (i + 1) === CUR_W;
      h += '<div class="cbar"><div class="cname"' + (cur ? ' style="color:var(--acc);font-weight:700"' : '') +
        '>W' + (i + 1) + '</div><div class="ctrack"><div class="cfill" style="width:' + pct +
        '%;' + (v >= S.settings.target ? 'background:linear-gradient(90deg,#2f9e6b,#3ecf8e)' : '') +
        '"></div></div><div class="cnum">' + v.toFixed(1) + 'h</div></div>';
    });
    h += '</div><div class="tiny" style="margin-top:8px">虚线目标为每周 ' + S.settings.target +
      ' 小时；绿色表示达标。实际需求约每周 18 小时才能从容。</div></div>';

    // 错因分布
    var byType = {};
    S.errors.forEach(function (e) { byType[e.type] = (byType[e.type] || 0) + 1; });
    var tkeys = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; });
    if (tkeys.length) {
      var tmax = byType[tkeys[0]];
      h += '<div class="card"><h2>错因分布</h2><div class="chart">';
      tkeys.forEach(function (t) {
        h += '<div class="cbar"><div class="cname">' + esc(t) + '</div><div class="ctrack">' +
          '<div class="cfill" style="width:' + Math.round(byType[t] / tmax * 100) + '%"></div></div>' +
          '<div class="cnum">' + byType[t] + '</div></div>';
      });
      h += '</div><div class="tiny" style="margin-top:8px">如果「计算失误 / 审题偏差」占比超过 40%，' +
        '问题在答题习惯而非知识，靠限时训练解决。</div></div>';
    }

    // 错题最多科目
    var bySubj = {};
    S.errors.forEach(function (e) { bySubj[e.subject] = (bySubj[e.subject] || 0) + 1; });
    var skeys = Object.keys(bySubj).sort(function (a, b) { return bySubj[b] - bySubj[a]; });
    if (skeys.length) {
      h += '<div class="card"><h2>错题分布（按科目）</h2><div class="chart">';
      var smax = bySubj[skeys[0]];
      skeys.forEach(function (s) {
        h += '<div class="cbar"><div class="cname">' + esc(s) + '</div><div class="ctrack">' +
          '<div class="cfill" style="background:linear-gradient(90deg,#7c5cd6,#a78bfa);width:' +
          Math.round(bySubj[s] / smax * 100) + '%"></div></div><div class="cnum">' + bySubj[s] + '</div></div>';
      });
      h += '</div></div>';
    }

    // 数据管理
    h += '<div class="card"><h2>数据</h2>' +
      '<div class="muted">数据只存在这台手机的浏览器里，不上传任何服务器。建议每周导出一次备份。</div>' +
      '<div class="btnblock"><button class="btn sm" data-export="1">导出备份 JSON</button>' +
      '<button class="btn sm" data-import="1">导入备份</button>' +
      '<button class="btn sm" data-ics="1">重新生成日历 .ics</button>' +
      '<button class="btn sm bad" data-reset="1">清空所有数据</button></div>' +
      '<div class="tiny" style="margin-top:10px">存储占用约 ' +
      (JSON.stringify(S).length / 1024).toFixed(1) + ' KB</div></div>';

    // 差异速查
    h += '<div class="card"><h2>两考差异速查</h2>';
    P.diffs.forEach(function (d) {
      h += '<h3>' + esc(d.subject) + '　<span class="pill">重合 ' + esc(d.overlap) + '</span></h3>' +
        '<div class="kv"><span class="k" style="flex-shrink:0">中级独有</span><span style="text-align:right;font-size:12.5px">' +
        esc(d.mid_only) + '</span></div>' +
        '<div class="kv"><span class="k" style="flex-shrink:0">CPA独有</span><span style="text-align:right;font-size:12.5px">' +
        esc(d.cpa_only) + '</span></div>' +
        '<div class="muted" style="margin-bottom:12px">⚠ ' + esc(d.tip) + '</div>';
    });
    h += '</div>';

    $('#statsBody').innerHTML = h;
  }

  // ============================================================ 视图：设置
  function viewSettings() {
    $('#tbTitle').textContent = '设置';
    $('#tbSub').textContent = '作息时间、周目标、日历生成';
    $('#tbRight').innerHTML = '';
    var s = S.settings;
    var h = '<div class="card"><h2>我的作息时间</h2>' +
      '<div class="muted" style="margin-bottom:12px">改完时间后，点下面的按钮会按新时间重新生成日历文件。' +
      '日历仍负责锁屏提醒，App 负责打卡与错题。</div>' +
      '<div class="field"><label>① 记忆时段（工作日）</label><input type="time" data-set="morning" value="' + s.morning + '"></div>' +
      '<div class="field"><label>② 刷题时段（工作日）</label><input type="time" data-set="noon" value="' + s.noon + '"></div>' +
      '<div class="field"><label>③ 新课+做题时段（工作日）</label><input type="time" data-set="evening" value="' + s.evening + '"></div>' +
      '<div class="field"><label>每周目标学时</label><input type="number" step="0.5" min="1" max="60" data-set="target" value="' +
      s.target + '"></div>' +
      '<div class="btnblock"><button class="btn sm pri" data-ics="1">生成/更新日历 .ics</button>' +
      '<button class="btn sm" data-ichelp="1">怎么导入手机日历？</button></div></div>';

    h += '<div class="card"><h2>考试日期</h2>' +
      '<div class="field"><label>CPA 专业阶段（预计）</label><input type="date" data-set="examDate" value="' +
      s.examDate + '"></div>' +
      '<div class="field"><label>中级会计（预计）</label><input type="date" data-set="examDate2" value="' +
      s.examDate2 + '"></div>' +
      '<div class="tiny">官方日期公布后改这里即可（中注协 2026 年 12 月、财政部年底发公告）。</div></div>';

    h += '<div class="card"><h2>关于</h2>' +
      '<div class="kv"><span class="k">数据来源</span><span class="v">2026-10-12 官方与机构官网核实</span></div>' +
      '<div class="kv"><span class="k">计划周期</span><span class="v">' + P.meta.start + ' → ' + P.meta.end + '</span></div>' +
      '<div class="kv"><span class="k">周数</span><span class="v">' + P.meta.weeks + ' 周</span></div>' +
      '<div class="muted" style="margin-top:8px">2027 年考试日期为预测值，请以中注协与财政部正式公告为准。' +
      '课程价格与师资为 2026 年 10 月官网数据，报班前请再核对。</div></div>';

    $('#settingsBody').innerHTML = h;
  }

  // ============================================================ 弹层
  function openSheet(html) {
    $('#sheet').innerHTML = html;
    $('#sheetWrap').hidden = false;

  }
  function closeSheet() { $('#sheetWrap').hidden = true; }

  function sheetDay(ds) {
    var rec = todayRec(ds);
    var d = s2d(ds);
    var h = '<h2>' + ds + ' 周' + WD[d.getDay()] + '</h2>' +
      '<div class="field"><label>实际学习时长（小时）</label>' +
      '<input type="number" step="0.5" min="0" max="24" id="fHours" value="' + (+rec.hours || 0) + '"></div>' +
      '<div class="field"><label>今天学了什么 / 卡在哪里</label>' +
      '<textarea id="fNote" rows="3" placeholder="例：合并报表抵销分录第3种情形没搞懂">' +
      esc(rec.note || '') + '</textarea></div>' +
      '<div class="btnblock"><button class="btn pri" data-saveday="' + ds + '">保存</button>' +
      '<button class="btn" data-close-sheet="1">取消</button></div>';
    openSheet(h);
  }

  function sheetError(id) {
    var e = id ? S.errors.filter(function (x) { return x.id === id; })[0] : null;
    e = e || { subject: SUBJECTS[0], chapter: '', type: TYPES[0], note: '', fix: '' };
    var h = '<h2>' + (id ? '编辑错题' : '记一道错题') + '</h2>' +
      '<div class="field"><label>科目</label><select id="eSubject">' +
      SUBJECTS.map(function (s) {
        return '<option' + (s === e.subject ? ' selected' : '') + '>' + s + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>章节 / 考点（可留空）</label>' +
      '<input id="eChapter" value="' + esc(e.chapter) + '" placeholder="例：第27章 合并财务报表"></div>' +
      '<div class="field"><label>错因类型</label><select id="eType">' +
      TYPES.map(function (t) {
        return '<option' + (t === e.type ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>错在哪 / 正确思路（一句话）</label>' +
      '<textarea id="eNote" rows="3" placeholder="不要抄整道题，只记：我为什么错 + 正确思路">' +
      esc(e.note) + '</textarea></div>' +
      '<div class="field"><label>下次怎么避免（可留空）</label>' +
      '<input id="eFix" value="' + esc(e.fix) + '" placeholder="例：先判断是否同一控制"></div>' +
      '<div class="btnblock"><button class="btn pri" data-saveerr="' + (id || '') + '">保存</button>' +
      '<button class="btn" data-close-sheet="1">取消</button></div>';
    openSheet(h);
  }

  function sheetChapter(key) {
    var p = key.split(':'), sid = p[0], ch = p[1];
    var grp = P.chapters[sid];
    var c = grp.items.filter(function (x) { return x.ch === ch; })[0];
    if (!c) return;
    var st = S.chapters[key] || {};
    var h = '<h2>' + esc(c.ch) + ' ' + esc(c.name) + '</h2>' +
      '<div class="row" style="gap:6px;margin-bottom:12px"><span class="pill">' + esc(grp.label) +
      '</span><span class="pill ' + (starCount(c.star) >= 4 ? 'warn' : '') + '">' +
      stars(starCount(c.star)) + '</span></div>' +
      '<div class="muted" style="margin-bottom:14px">' + esc(c.note) + '</div>' +
      '<div class="field"><label>第 1 轮完成日期</label><input type="date" data-chip="' + key +
      '" data-chipf="r1" value="' + (st.r1 || '') + '"></div>' +
      '<div class="field"><label>第 2 轮完成日期</label><input type="date" data-chip="' + key +
      '" data-chipf="r2" value="' + (st.r2 || '') + '"></div>' +
      '<div class="btnblock"><button class="btn ' + (st.done ? 'ok' : 'pri') + '" data-chapdone="' + key + '">' +
      (st.done ? '✓ 已完成（点此取消）' : '标记本章完成') + '</button>' +
      '<button class="btn" data-close-sheet="1">关闭</button></div>';
    openSheet(h);
  }

  function sheetMonth() {
    var h = '<h2>按月打卡记录</h2>';
    var months = {};
    Object.keys(S.checkins).forEach(function (ds) {
      var m = ds.slice(0, 7);
      var r = S.checkins[ds];
      if (!months[m]) months[m] = { h: 0, d: 0 };
      if ((+r.hours || 0) > 0) { months[m].h += +r.hours; months[m].d++; }
    });
    var keys = Object.keys(months).sort().reverse();
    if (!keys.length) h += '<div class="empty">还没有打卡记录</div>';
    keys.forEach(function (m) {
      h += '<div class="lrow"><div class="lt">' + m.replace('-', ' 年 ') + ' 月</div>' +
        '<div class="lv">' + months[m].h.toFixed(1) + 'h</div>' +
        '<div class="tiny" style="width:52px;text-align:right">' + months[m].d + ' 天</div></div>';
    });
    h += '<div class="btnblock"><button class="btn" data-close-sheet="1">关闭</button></div>';
    openSheet(h);
  }

  function sheetIcsHelp() {
    openSheet('<h2>怎么把日历导进手机</h2>' +
      '<h3>Android（Chrome）</h3><div class="muted">' +
      '① 点「生成/更新日历 .ics」下载文件；<br>' +
      '② 打开手机「Google 日历」网页版（calendar.google.com）→ 设置 → 导入和导出 → 选择该文件 → 导入；<br>' +
      '③ 手机上的 Google 日历 App 会自动同步，提醒由日历负责。<br>' +
      '或者：用文件管理器点开 .ics 文件，选择用「日历」应用打开。</div>' +
      '<h3>iPhone</h3><div class="muted">点开 .ics 文件 → 选择「添加到日历」。</div>' +
      '<h3>提醒说明</h3><div class="muted">' +
      '每日 5 个固定时段会按你设置的时间提前 5 分钟提醒，开始后 15 分钟再追问一次；' +
      '报名/交费/检查点等重要节点会提前 3 天和 1 天各提醒一次。</div>' +
      '<div class="btnblock"><button class="btn pri" data-close-sheet="1">知道了</button></div>');
  }

  // ============================================================ ICS 生成（纯前端）
  function pad2(n) { return String(n).padStart(2, '0'); }
  function icsEsc(t) {
    return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;')
      .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function foldLine(line) {
    // RFC 5545: 每行不超过 75 octets，续行以单个空格开头。
    // 必须按「字符」切分（不能按字节），否则会切坏 UTF-8 多字节字符。
    var enc = new TextEncoder();
    var out = [], cur = '', curLen = 0, limit = 73;   // 73 + CRLF = 75
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      var n = enc.encode(ch).length;
      if (curLen + n > limit) { out.push(cur); cur = ' ' + ch; curLen = 1 + n; }
      else { cur += ch; curLen += n; }
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function buildICS() {
    var L = [], s = S.settings;
    function add(x) { L.push(foldLine(x)); }
    function dtf(d, hh, mm) {
      return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(hh) + pad2(mm) + '00';
    }
    function al(min, follow, atHM) {
      var a = ['BEGIN:VALARM'];
      if (atHM) a.push('TRIGGER;VALUE=DATE-TIME:' + dtf(s2d(P.meta.start), atHM[0], atHM[1]));
      else a.push('TRIGGER:-PT' + min + 'M');
      a.push('ACTION:DISPLAY', 'DESCRIPTION:该学习了', 'END:VALARM');
      if (follow) a.push('BEGIN:VALARM', 'TRIGGER:PT' + follow + 'M',
        'ACTION:DISPLAY', 'DESCRIPTION:开始了吗？别刷手机', 'END:VALARM');
      return a;
    }
    function ev(o) {
      add('BEGIN:VEVENT');
      add('UID:' + o.uid + '@zkplan.local');
      add('DTSTAMP:20261012T040000Z');
      add(o.dtstart); add(o.dtend);
      add('SUMMARY:' + icsEsc(o.summary));
      if (o.desc) add('DESCRIPTION:' + icsEsc(o.desc));
      add('CATEGORIES:' + icsEsc(o.cat || '备考'));
      if (o.rrule) add('RRULE:' + o.rrule);
      (o.alarms || []).forEach(function (x) { add(x); });
      add('END:VEVENT');
    }
    add('BEGIN:VCALENDAR');
    add('VERSION:2.0');
    add('PRODID:-//zkplan//中级+CPA同考备考//CN');
    add('CALSCALE:GREGORIAN');
    add('METHOD:PUBLISH');
    add('X-WR-CALNAME:中级+CPA同考备考(' + new Date().getFullYear() + ')');
    add('BEGIN:VTIMEZONE');
    add('TZID:Asia/Shanghai');
    add('BEGIN:STANDARD');
    add('DTSTART:19700101T000000');
    add('TZOFFSETFROM:+0800'); add('TZOFFSETTO:+0800'); add('TZNAME:CST');
    add('END:STANDARD'); add('END:VTIMEZONE');

    var start = s2d(P.meta.start);
    var routineEnd = addDays(s2d(P.weeks[P.meta.weeks - 2].start), -3);  // 第45周的前一个周五
    var blocks = [
      ['morning', s.morning, 50, '① 记忆：经济法法条 / 财管公式 / 易错点默写',
        '用默写而不是朗读：合上书，把昨天背的写出来。'],
      ['noon', s.noon, 30, '② 刷题：APP章节练习 15—20 题',
        '只做近两天学过的内容。错题当场记进 App 错题本。'],
      ['evening', s.evening, 120, '③ 新课+做题：听课60min + 做题60min',
        '铁律：听课时间 ≤ 做题时间。第38周起改为整套限时模拟+复盘。']
    ];
    blocks.forEach(function (b) {
      var hm = b[1].split(':'), h = +hm[0], m = +hm[1];
      var endM = h * 60 + m + b[2], eh = Math.floor(endM / 60) % 24, em = endM % 60;
      ev({
        uid: 'daily-' + b[0],
        dtstart: 'DTSTART:' + dtf(start, h, m),
        dtend: 'DTEND:' + dtf(start, eh, em),
        summary: b[3],
        desc: b[4] + '\n\n（来自备考 App，可在设置里改时间后重新生成）',
        rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=' + dtf(routineEnd, h, m),
        alarms: al(5, 15), cat: '日常学习'
      });
    });
    // 周末
    var sat = addDays(start, 5), sun = addDays(start, 6);
    var routineSat = addDays(s2d(P.weeks[P.meta.weeks - 2].start), -2);
    var routineSun = addDays(s2d(P.weeks[P.meta.weeks - 2].start), -1);
    ev({
      uid: 'weekly-sat', dtstart: 'DTSTART:' + dtf(sat, 9, 0), dtend: 'DTEND:' + dtf(sat, 13, 0),
      summary: '④ 周六攻坚 4h：本周最难章节专题 + 周测',
      desc: '先做周测（限时），再针对错的章节做专题。第23周起改为做中级轻一/真题。',
      rrule: 'FREQ=WEEKLY;BYDAY=SA;UNTIL=' + dtf(routineSat, 9, 0),
      alarms: al(30, 20), cat: '周末整块'
    });
    ev({
      uid: 'weekly-sun', dtstart: 'DTSTART:' + dtf(sun, 9, 0), dtend: 'DTEND:' + dtf(sun, 13, 0),
      summary: '⑤ 周日 4h：限时机考模拟 + 逐题复盘',
      desc: '上午限时机考模拟，下午逐题复盘。第32周起固定给CPA模考。',
      rrule: 'FREQ=WEEKLY;BYDAY=SU;UNTIL=' + dtf(routineSun, 9, 0),
      alarms: al(30, 20), cat: '周末整块'
    });
    // 周目标
    P.weeks.forEach(function (w) {
      if (w.w >= 43) return;
      ev({
        uid: 'week-' + w.w, dtstart: 'DTSTART;VALUE=DATE:' + w.start.replace(/-/g, ''),
        dtend: 'DTEND;VALUE=DATE:' + d2s(addDays(s2d(w.start), 7)).replace(/-/g, ''),
        summary: '第' + w.w + '周目标：' + w.goal,
        desc: '详细章节安排见 App「本周」页。', cat: '周目标',
        alarms: al(0, 0, [7, 0])
      });
    });
    // 里程碑
    P.milestones.forEach(function (m) {
      ev({
        uid: 'ms-' + m.date.replace(/-/g, ''),
        dtstart: 'DTSTART;VALUE=DATE:' + m.date.replace(/-/g, ''),
        dtend: 'DTEND;VALUE=DATE:' + d2s(addDays(s2d(m.date), 1)).replace(/-/g, ''),
        summary: m.title, desc: m.desc, cat: '里程碑', alarms: al(0, 0, [8, 0])
      });
    });
    // 考试
    P.exams.forEach(function (e, i) {
      ev({
        uid: 'exam-' + i,
        dtstart: 'DTSTART;TZID=Asia/Shanghai:' + e.date.replace(/-/g, '') + 'T' +
          e.start.replace(':', '') + '00',
        dtend: 'DTEND;TZID=Asia/Shanghai:' + e.date.replace(/-/g, '') + 'T' +
          e.end.replace(':', '') + '00',
        summary: '★ ' + e.name + '（' + e.dur + '）',
        desc: '日期与场次为预测，以准考证为准。可带无存储计算器；禁止科学/可编程计算器、手机、智能手表。',
        cat: '考试', alarms: al(120, 0)
      });
    });
    add('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }

  function downloadIcs() {
    var txt = buildICS();
    var blob = new Blob([txt], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '中级CPA备考计划_手机日历.ics';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('日历已生成，共 ' + (txt.match(/BEGIN:VEVENT/g) || []).length + ' 个事件');
  }

  // ============================================================ 路由
  var nav = 'today';
  function render() {
    var t = $('#tbTitle');
    if (nav === 'today') viewToday();
    else if (nav === 'week') viewWeek();
    else if (nav === 'plan') viewPlan();
    else if (nav === 'checkin') viewCheckin();
    else if (nav === 'errors') viewErrors();
    else if (nav === 'stats') viewStats();
    else if (nav === 'settings') viewSettings();
    $$('.tab').forEach(function (b) { b.classList.toggle('active', b.dataset.nav === nav); });
    $$('.screen').forEach(function (s) { s.hidden = s.id !== 'screen-' + nav; });
    window.scrollTo(0, 0);
  }
  function go(n) {
    nav = n;
    if (n !== 'errors') $('#tbRight').innerHTML = '';
    render();
  }

  // ============================================================ 事件
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-nav],[data-check],[data-h],[data-quick],[data-note],' +
      '[data-saveday],[data-day],[data-month],[data-week],[data-wdone],[data-phase],' +
      '[data-chap],[data-chip],[data-chapdone],[data-adderr],[data-ef],[data-edone],' +
      '[data-erecur],[data-eedit],[data-edel],[data-saveerr],[data-export],[data-import],' +
      '[data-ics],[data-ichelp],[data-reset],[data-close-sheet],[data-detail]');
    if (!el) return;

    // 关闭弹层
    if (el.hasAttribute('data-close-sheet') || el.classList.contains('sheet-mask')) {
      closeSheet(); return;
    }
    if (el.dataset.nav) { go(el.dataset.nav); return; }

    // 今日任务勾选
    if (el.dataset.check) {
      var rec = todayRec(d2s(TODAY));
      rec.routine[el.dataset.check] = !rec.routine[el.dataset.check];
      save(); render();
      if (rec.routine[el.dataset.check]) toast('已打卡 ✓');
      return;
    }
    // 学时加减
    if (el.dataset.h) {
      var r2 = todayRec(d2s(TODAY));
      r2.hours = Math.max(0, Math.round(((+r2.hours || 0) + parseFloat(el.dataset.h)) * 10) / 10);
      save(); render(); return;
    }
    if (el.dataset.quick) {
      var r3 = todayRec(d2s(TODAY));
      if (el.dataset.quick === 'reset') r3.hours = 0;
      else r3.hours = Math.round(((+r3.hours || 0) + parseFloat(el.dataset.quick)) * 10) / 10;
      save(); render(); toast('今日 ' + r3.hours.toFixed(1) + ' 小时'); return;
    }
    if (el.dataset.note) { sheetDay(d2s(TODAY)); return; }

    // 打卡日/月
    if (el.dataset.day) { sheetDay(el.dataset.day); return; }
    if (el.dataset.month) { sheetMonth(); return; }

    // 保存某天
    if (el.dataset.saveday) {
      var ds = el.dataset.saveday, rr = todayRec(ds);
      rr.hours = Math.max(0, parseFloat($('#fHours').value) || 0);
      rr.note = $('#fNote').value.trim();
      save(true); closeSheet(); render(); toast('已保存 ' + ds); return;
    }

    // 周卡片展开
    var wkEl = e.target.closest('.wk');
    if (wkEl && !el.dataset.wdone && !el.dataset.chap && !el.dataset.detail) {
      wkEl.classList.toggle('open');
    }
    if (el.dataset.detail) {
      var wEl = el.closest('.screen').querySelector('.wk[data-week="' + el.dataset.detail + '"]');
      if (wEl) { wEl.classList.add('open'); wEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    // 标记周完成
    if (el.dataset.wdone) {
      var wno = el.dataset.wdone;
      S.weeks[wno] = S.weeks[wno] || {};
      S.weeks[wno].done = !S.weeks[wno].done;
      save(true); render(); toast(S.weeks[wno].done ? '第' + wno + '周已标记完成' : '已取消');
      return;
    }
    // 阶段筛选
    if (el.dataset.phase) { planFilter = el.dataset.phase; viewPlan(); return; }

    // 章节
    if (el.dataset.chap) { e.stopPropagation(); sheetChapter(el.dataset.chap); return; }
    if (el.dataset.chapdone) {
      var key = el.dataset.chapdone;
      S.chapters[key] = S.chapters[key] || {};
      S.chapters[key].done = !S.chapters[key].done;
      if (S.chapters[key].done && !S.chapters[key].r1) S.chapters[key].r1 = d2s(TODAY);
      save(true); closeSheet(); render();
      toast(S.chapters[key].done ? '已完成 ✓' : '已取消完成'); return;
    }

    // 错题
    if (el.dataset.adderr) { sheetError(''); return; }
    if (el.dataset.ef) {
      var p = el.dataset.ef.split(':');
      errFilter[p[0]] = p[0] === 'open' ? !errFilter.open : p[1];
      viewErrors(); return;
    }
    if (el.dataset.edone) {
      var id = +el.dataset.edone;
      S.errors.forEach(function (x) { if (x.id === id) x.done = !x.done; });
      save(true); viewErrors(); return;
    }
    if (el.dataset.erecur) {
      var id2 = +el.dataset.erecur;
      S.errors.forEach(function (x) { if (x.id === id2) { x.recur = (x.recur || 0) + 1; x.done = false; } });
      save(true); viewErrors(); toast('已记为复发，重点看它'); return;
    }
    if (el.dataset.eedit) { sheetError(+el.dataset.eedit); return; }
    if (el.dataset.edel) {
      var id3 = +el.dataset.edel;
      if (confirm('确定删除这条错题？')) {
        S.errors = S.errors.filter(function (x) { return x.id !== id3; });
        save(true); viewErrors(); toast('已删除');
      }
      return;
    }
    if (el.hasAttribute('data-saveerr')) {

      var eid = el.dataset.saveerr ? +el.dataset.saveerr : 0;
      var obj = {
        subject: $('#eSubject').value, chapter: $('#eChapter').value.trim(),
        type: $('#eType').value, note: $('#eNote').value.trim(), fix: $('#eFix').value.trim()
      };
      if (eid) {
        S.errors.forEach(function (x) { if (x.id === eid) Object.assign(x, obj); });
      } else {
        obj.id = Date.now(); obj.date = d2s(TODAY); obj.done = false; obj.recur = 0;
        S.errors.push(obj);
      }
      save(true); closeSheet(); viewErrors(); toast(eid ? '已更新' : '已记录，共 ' + S.errors.length + ' 条');
      return;
    }

    // 数据
    if (el.dataset.export) {
      var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '备考数据备份_' + d2s(TODAY) + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('已导出备份'); return;
    }
    if (el.dataset.import) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var o = JSON.parse(fr.result);
            if (!o || typeof o !== 'object') throw 0;
            if (!confirm('导入会覆盖当前全部数据，确定继续？')) return;
            S = o; save(true); go('today'); toast('导入成功');
          } catch (err) { toast('文件格式不对'); }
        };
        fr.readAsText(f);
      };
      inp.click(); return;
    }
    if (el.dataset.ics) { downloadIcs(); return; }
    if (el.dataset.ichelp) { sheetIcsHelp(); return; }
    if (el.dataset.reset) {
      if (confirm('会清空打卡、学时、错题和章节进度，且无法恢复。确定？') &&
          confirm('再确认一次：真的要清空吗？')) {
        localStorage.removeItem(KEY);
        S = JSON.parse(JSON.stringify(DEFAULT));
        go('today'); toast('已清空');
      }
      return;
    }
  });

  // 设置项变更
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.set) {
      var v = t.value;
      S.settings[t.dataset.set] = (t.dataset.set === 'target') ? (parseFloat(v) || 15) : v;
      save(true);
      if (nav === 'checkin' || nav === 'stats' || nav === 'today') render();
      if (t.dataset.set !== 'target') toast('已保存，记得重新生成日历');
      return;
    }
    if (t.dataset && t.dataset.chip) {
      var key = t.dataset.chip;
      S.chapters[key] = S.chapters[key] || {};
      S.chapters[key][t.dataset.chipf] = t.value;
      save(true); return;
    }
  });

  // 输入同步（textarea/input 的 note 保存由按钮触发，这里只在丢失焦点时兜底）
  document.addEventListener('blur', function (e) {
    var t = e.target;
    if (t.id === 'fNote' || t.id === 'fHours') { /* 由保存按钮处理 */ }
  }, true);

  // 顶栏右侧设置入口：长按标题
  $('#tbTitle').addEventListener('dblclick', function () { go('settings'); });

  // ============================================================ 启动
  go('today');

  // 每天首次打开时，如果昨天有未记录，提示一下
  (function dailyNudge() {
    var y = d2s(addDays(TODAY, -1));
    var r = S.checkins[y];
    var flagged = localStorage.getItem(KEY + '.nudged');
    if ((!r || !(+r.hours)) && flagged !== d2s(TODAY) && y >= P.meta.start) {
      localStorage.setItem(KEY + '.nudged', d2s(TODAY));
      setTimeout(function () { toast('昨天没记学时任？点打卡页补记'); }, 1200);
    }
  })();

  // Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    });
  }
})();
