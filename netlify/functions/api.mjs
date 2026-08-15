import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

// ===== 工具 =====
const S = () => getStore('jifen');

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hashPw(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 32).toString('hex');
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

// ===== 默认积分配置（来自 Excel：喜宝家庭奖惩积分表）=====
const DEFAULT_CONFIG = {
  rewards: [
    { category: '生活习惯', items: [
      { name: '早上按时起床', points: 1 },
      { name: '独立刷牙洗脸', points: 1 },
      { name: '吃饭不挑食', points: 1 },
      { name: '自己收拾餐具', points: 1 },
      { name: '自己穿衣服', points: 1 },
      { name: '9点半前上床睡觉', points: 1 },
    ]},
    { category: '学习习惯', items: [
      { name: '及时整理桌面/书包', points: 1 },
      { name: '作业认真思考，字迹工整', points: 1 },
      { name: '作业不拖延', points: 1 },
      { name: '上课举手', points: 1 },
      { name: '正确回答老师提问', points: 2 },
      { name: '老师群里表扬一次', points: 4 },
      { name: '每天识字5个', points: 1 },
      { name: '数学试卷1张', points: 3 },
      { name: '数学作业全对', points: 2 },
      { name: '古诗背诵1首', points: 5 },
      { name: '书法写字1页', points: 2 },
      { name: '获奖状、奖杯、奖牌', points: 20 },
    ]},
    { category: '兴趣拓展', items: [
      { name: '参加跳舞得分10分', points: 2 },
      { name: '跳绳打卡1次', points: 2 },
      { name: '小区跑步2圈', points: 2 },
    ]},
    { category: '家庭品行', items: [
      { name: '对家人朋友有礼貌', points: 2 },
      { name: '洗碗/擦桌子/拖地', points: 2 },
      { name: '其他表现优秀的情况', points: null },
    ]},
  ],
  punishes: [
    { category: '生活习惯', items: [
      { name: '饭前便后不洗手', points: -1 },
      { name: '乱扔衣服鞋子', points: -1 },
      { name: '故意损坏物品', points: -2 },
      { name: '个人物品乱丢乱放', points: -1 },
    ]},
    { category: '学习习惯', items: [
      { name: '书桌脏乱差', points: -2 },
      { name: '作业本乱涂乱画', points: -1 },
      { name: '作业拖延', points: -2 },
      { name: '学校忘记东西', points: -2 },
    ]},
    { category: '行为品德', items: [
      { name: '学校打人', points: -5 },
      { name: '说谎话', points: -5 },
      { name: '表现差，老师找家长', points: -10 },
      { name: '给别人取外号或嘲笑别人', points: -5 },
      { name: '在公共场合乱跑', points: -2 },
      { name: '私拿别人物品', points: -5 },
      { name: '未经允许到别人家', points: -5 },
      { name: '在家打人，骂人', points: -5 },
      { name: '不讲道理发脾气', points: -2 },
      { name: '其他表现不好的情况', points: null },
    ]},
  ],
  mall: [
    { name: '零食兑换券', desc: '自选一个喜欢的零食或饮料', points: 50, icon: '🍬' },
    { name: '文具兑换券', desc: '兑换文具1个', points: 50, icon: '✏️' },
    { name: '半小时电视/游戏', desc: '作业完成后可以玩', points: 50, icon: '🎮' },
    { name: '自选玩具券', desc: '自选60元内玩具', points: 100, icon: '🧸' },
    { name: '周末计划券', desc: '制定周末计划，决定就餐地点', points: 100, icon: '📋' },
    { name: '户外活动券', desc: '爬山/采摘/野炊/露营等', points: 100, icon: '🏞️' },
    { name: '到姑姑家玩', desc: '和哥哥姐姐一起玩', points: 300, icon: '👨‍👩‍👧‍👦' },
    { name: '实现一个愿望', desc: '物质类200元以内', points: 300, icon: '🌟' },
    { name: '其他自提要求', desc: '视情况而定', points: null, icon: '🎁' },
  ],
};

// ===== 存取助手 =====
async function getAuth() {
  const raw = await (await S()).get('auth');
  return raw ? JSON.parse(raw) : null;
}

async function checkAuth(req) {
  const h = req.headers.get('authorization') || '';
  const token = h.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const st = await S();
  const raw = await st.get('session:' + token);
  if (!raw) return false;
  const s = JSON.parse(raw);
  if (s.exp < Date.now()) {
    await st.delete('session:' + token);
    return false;
  }
  return true;
}

async function getBalance(st) {
  const raw = await st.get('balance');
  return raw ? Number(raw) : 0;
}

async function getJson(st, key, fallback) {
  const raw = await st.get(key);
  try { return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}

async function getDays(st) {
  const list = await st.list({ prefix: 'day:' });
  const days = {};
  for (const b of list.blobs) {
    const date = b.key.slice(4);
    try { days[date] = JSON.parse(await st.get(b.key)); } catch { /* skip */ }
  }
  return days;
}

// 初始积分（首次未存储时，从旧 balance 反推迁移）
async function getInitial(st) {
  const raw = await st.get('initial');
  let init = (raw == null || raw === '') ? NaN : Number(raw);
  if (!Number.isFinite(init)) {
    const days = await getDays(st);
    const records = await getJson(st, 'records', []);
    let daySum = 0;
    for (const d of Object.values(days)) daySum += sumObj(d.rewards) + sumObj(d.punishes);
    const spent = records.reduce((a, r) => a + (Number(r.points) || 0), 0);
    init = (await getBalance(st)) - daySum + spent;
    await st.set('initial', String(init));
  }
  return init;
}

// 积分总额 = 初始积分 + 每日积分余额累计（奖励-惩罚） - 已兑换商品消耗
async function computeBalance(st) {
  const init = await getInitial(st);
  const days = await getDays(st);
  const records = await getJson(st, 'records', []);
  let total = init;
  for (const d of Object.values(days)) total += sumObj(d.rewards) + sumObj(d.punishes);
  const spent = records.reduce((a, r) => a + (Number(r.points) || 0), 0);
  return total - spent;
}

const sumObj = (obj) => Object.values(obj || {}).reduce(
  (a, v) => (typeof v === 'number' && Number.isFinite(v) ? a + v : a), 0);

// ===== 主函数 =====
export default async (req) => {
  const url = new URL(req.url);
  const path = (url.pathname.replace(/^.*\/api/, '') || '/').replace(/\/+$/, '') || '/';
  const method = req.method;

  try {
    const st = await S();

    // --- 无需登录 ---
    if (method === 'GET' && path === '/status') {
      const auth = await getAuth();
      return json({ needSetup: !auth, loggedIn: await checkAuth(req) });
    }

    if (method === 'POST' && path === '/setup') {
      const auth = await getAuth();
      if (auth) return json({ error: '系统已初始化，请直接登录' }, 400);
      const body = await req.json().catch(() => ({}));
      const password = String(body.password || '');
      if (password.length < 4) return json({ error: '密码至少需要4位' }, 400);
      const salt = crypto.randomBytes(8).toString('hex');
      await st.set('auth', JSON.stringify({ salt, hash: hashPw(password, salt) }));
      await st.set('initial', String(Number(body.initialBalance) || 0));
      await st.set('balance', String(Number(body.initialBalance) || 0));
      await st.set('config', JSON.stringify(DEFAULT_CONFIG));
      await st.set('records', JSON.stringify([]));
      return json({ ok: true });
    }

    if (method === 'POST' && path === '/login') {
      const auth = await getAuth();
      if (!auth) return json({ error: '系统未初始化' }, 400);
      const body = await req.json().catch(() => ({}));
      if (hashPw(String(body.password || ''), auth.salt) !== auth.hash) {
        return json({ error: '密码错误' }, 401);
      }
      const token = newToken();
      await st.set('session:' + token, JSON.stringify({ exp: Date.now() + 30 * 24 * 3600 * 1000 }));
      return json({ token });
    }

    // --- 以下需要登录 ---
    if (!(await checkAuth(req))) return json({ error: '未登录或登录已过期' }, 401);

    if (method === 'POST' && path === '/logout') {
      const h = req.headers.get('authorization') || '';
      await st.delete('session:' + h.replace(/^Bearer\s+/i, ''));
      return json({ ok: true });
    }

    if (method === 'POST' && path === '/password') {
      const body = await req.json().catch(() => ({}));
      const auth = await getAuth();
      if (hashPw(String(body.oldPassword || ''), auth.salt) !== auth.hash) {
        return json({ error: '原密码错误' }, 400);
      }
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 4) return json({ error: '新密码至少需要4位' }, 400);
      const salt = crypto.randomBytes(8).toString('hex');
      await st.set('auth', JSON.stringify({ salt, hash: hashPw(newPassword, salt) }));
      return json({ ok: true });
    }

    if (method === 'GET' && path === '/data') {
      const config = await getJson(st, 'config', DEFAULT_CONFIG);
      const balance = await computeBalance(st);
      const records = await getJson(st, 'records', []);
      const days = await getDays(st);
      return json({ config, balance, records, days });
    }

    if (method === 'POST' && path === '/day') {
      const body = await req.json().catch(() => ({}));
      const date = String(body.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: '日期格式错误' }, 400);
      const clean = (obj) => {
        const out = {};
        for (const [k, v] of Object.entries(obj || {})) {
          const n = Number(v);
          if (typeof k === 'string' && k && Number.isFinite(n)) out[k] = n;
        }
        return out;
      };
      const rewards = clean(body.rewards);
      const punishes = clean(body.punishes);
      const key = 'day:' + date;
      await st.set(key, JSON.stringify({ rewards, punishes }));
      const balance = await computeBalance(st);
      return json({ ok: true, balance });
    }

    if (method === 'POST' && path === '/exchange') {
      const body = await req.json().catch(() => ({}));
      const config = await getJson(st, 'config', DEFAULT_CONFIG);
      const index = Number(body.index);
      const item = Array.isArray(config.mall) ? config.mall[index] : null;
      if (!item) return json({ error: '兑换项目不存在' }, 400);
      const cost = item.points == null ? Number(body.cost) : Number(item.points);
      if (!Number.isFinite(cost) || cost < 0) return json({ error: '请输入有效的兑换积分' }, 400);
      let balance = await computeBalance(st);
      if (cost > balance) return json({ error: '积分不足，当前余额 ' + balance }, 400);
      balance -= cost;
      const records = await getJson(st, 'records', []);
      records.unshift({
        name: item.name, icon: item.icon || '🎁',
        points: cost, ts: Date.now(), balance,
      });
      await st.set('records', JSON.stringify(records));
      return json({ ok: true, balance, records });
    }

    if (method === 'POST' && path === '/config') {
      const body = await req.json().catch(() => ({}));
      const validate = (groups, signed) => Array.isArray(groups) && groups.every(g =>
        g && typeof g.category === 'string' && Array.isArray(g.items) &&
        g.items.every(i => i && typeof i.name === 'string' &&
          (i.points == null || Number.isFinite(Number(i.points))))
      );
      if (!validate(body.rewards) || !validate(body.punishes)) {
        return json({ error: '奖励/惩罚配置格式错误' }, 400);
      }
      if (!Array.isArray(body.mall) || !body.mall.every(m =>
        m && typeof m.name === 'string' && (m.points == null || Number.isFinite(Number(m.points)))
      )) {
        return json({ error: '商城配置格式错误' }, 400);
      }
      await st.set('config', JSON.stringify({
        rewards: body.rewards, punishes: body.punishes, mall: body.mall,
      }));
      return json({ ok: true });
    }

    return json({ error: '接口不存在' }, 404);
  } catch (e) {
    return json({ error: '服务器错误：' + (e.message || e) }, 500);
  }
};

export const config = { path: '/api/*' };
