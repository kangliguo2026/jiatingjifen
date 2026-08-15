import api from '../netlify/functions/api.mjs';

const J = (s) => JSON.stringify(s);
let passed = 0, failed = 0;

async function call(method, path, body, token) {
  const req = new Request(`https://x.netlify.app/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    ...(body !== undefined ? { body: J(body) } : {}),
  });
  const res = await api(req);
  return { status: res.status, data: await res.json() };
}

function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? J(extra) : ''); }
}

// 1. status: needSetup
let r = await call('GET', '/status');
check('status needSetup', r.status === 200 && r.data.needSetup === true, r);

// 2. data without auth -> 401
r = await call('GET', '/data');
check('data unauthorized', r.status === 401, r);

// 3. setup
r = await call('POST', '/setup', { password: '1234', initialBalance: 88 });
check('setup ok', r.status === 200 && r.data.ok, r);

// 4. setup again -> 400
r = await call('POST', '/setup', { password: '9999' });
check('setup twice rejected', r.status === 400, r);

// 5. wrong password
r = await call('POST', '/login', { password: 'wrong' });
check('wrong password 401', r.status === 401, r);

// 6. login
r = await call('POST', '/login', { password: '1234' });
check('login token', r.status === 200 && !!r.data.token, r);
const tk = r.data.token;

// 7. data
r = await call('GET', '/data', undefined, tk);
check('data balance=88', r.status === 200 && r.data.balance === 88, r);
check('data default config', r.data.config.rewards.length === 4 && r.data.config.mall.length === 9, r.data.config && r.data.config.rewards.length);

// 8. save day: 1+2 reward, -5 punish
r = await call('POST', '/day', { date: '2026-08-15', rewards: { '早上按时起床': 1, '古诗背诵1首': 5 }, punishes: { '说谎话': -5 } }, tk);
check('day save', r.status === 200 && r.data.ok, r);
check('balance 88+1=89', r.data.balance === 89, r.data);

// 9. resave same day with different values -> delta correct
r = await call('POST', '/day', { date: '2026-08-15', rewards: { '早上按时起床': 1 }, punishes: {} }, tk);
check('resave delta balance 88+1=89', r.data.balance === 89, r.data);

// 10. exchange normal item (50)
r = await call('POST', '/exchange', { index: 0 }, tk);
check('exchange ok balance 89-50=39', r.status === 200 && r.data.balance === 39, r);
check('records 1 entry', r.data.records.length === 1, r.data.records);

// 11. exchange insufficient
r = await call('POST', '/exchange', { index: 6 }, tk); // 300分
check('insufficient 400', r.status === 400, r);

// 12. exchange 视情况 item with cost
r = await call('POST', '/exchange', { index: 8, cost: 9 }, tk);
check('custom cost exchange balance 39-9=30', r.status === 200 && r.data.balance === 30, r);

// 13. custom cost without value -> 400
r = await call('POST', '/exchange', { index: 8 }, tk);
check('custom cost missing 400', r.status === 400, r);

// 14. config update
const data = (await call('GET', '/data', undefined, tk)).data;
data.config.rewards[0].items.push({ name: '测试新项目', points: 3 });
data.config.mall.push({ name: '测试券', desc: '', points: 5, icon: '🧪' });
r = await call('POST', '/config', data.config, tk);
check('config save', r.status === 200, r);
const data2 = (await call('GET', '/data', undefined, tk)).data;
check('config persisted', data2.config.rewards[0].items.some(i => i.name === '测试新项目') && data2.config.mall.length === 10, data2.config.mall.length);

// 15. exchange new item index 9
r = await call('POST', '/exchange', { index: 9 }, tk);
check('exchange new item balance 30-5=25', r.status === 200 && r.data.balance === 25, r);

// 16. change password
r = await call('POST', '/password', { oldPassword: '1234', newPassword: '5678' }, tk);
check('password change', r.status === 200, r);
r = await call('POST', '/login', { password: '1234' });
check('old password rejected', r.status === 401, r);
r = await call('POST', '/login', { password: '5678' });
check('new password works', r.status === 200 && !!r.data.token, r);
const tk2 = r.data.token;

// 17. bad config rejected
r = await call('POST', '/config', { rewards: 'nope', punishes: [], mall: [] }, tk);
check('bad config 400', r.status === 400, r);

// 18. logout invalidates session
r = await call('POST', '/logout', {}, tk2);
check('logout ok', r.status === 200, r);
r = await call('GET', '/data', undefined, tk2);
check('token invalid after logout', r.status === 401, r);

// 19. bad date
r = await call('POST', '/day', { date: 'bad', rewards: {}, punishes: {} }, await (async () => (await call('POST', '/login', { password: '5678' })).data.token)());
check('bad date 400', r.status === 400, r);

console.log(`\n结果: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
