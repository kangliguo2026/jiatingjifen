# 喜宝家庭积分 (jiatingjifen)

适合手机使用的家庭奖惩积分管理系统。家长通过积分量化孩子的日常表现，孩子用积分在家庭商城兑换奖励。

## 功能

- **登录**：家庭密码登录（首次使用时设置密码和初始积分结余），密码 scrypt 加密存储
- **奖励 / 惩罚**：按分类折叠展示，点击选择对应分值（不选为 0 分），"视情况"项目手动输入分值，按日提交
- **积分商城**：积分兑换奖励，"视情况"商品兑换时输入消耗分值，余额自动扣减
- **兑换记录**：兑换历史，含时间与兑换后余额
- **管理**：自由增删改奖励/惩罚/商城项目及分值，修改家庭密码

## 技术栈

- 前端：单页 HTML（原生 JS，移动端优先，430px 布局）
- 后端：Netlify Functions（`netlify/functions/api.mjs`）
- 存储：Netlify Blobs（键值存储，`jifen` store）

## 数据结构（Netlify Blobs）

| Key | 内容 |
| --- | --- |
| `auth` | `{salt, hash}` 密码散列 |
| `session:<token>` | 登录会话（30 天有效） |
| `balance` | 当前积分余额 |
| `config` | `{rewards, punishes, mall}` 项目配置 |
| `day:YYYY-MM-DD` | 每日奖励/惩罚选择 |
| `records` | 兑换记录数组 |

## 本地开发

```bash
npm install
npx netlify dev   # 需要先 netlify login 并 link 站点（Blobs 需要）
```

## 部署

```bash
npm run deploy
```

或推送到 GitHub 后在 Netlify 控制台关联仓库自动部署。
部署后在 Netlify 控制台确认已启用 Blobs（默认启用）。

## API

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/api/status` | 是否初始化/已登录 | - |
| POST | `/api/setup` | 首次初始化（密码、初始积分） | - |
| POST | `/api/login` | 登录，返回 token | - |
| POST | `/api/logout` | 退出登录 | ✅ |
| POST | `/api/password` | 修改密码 | ✅ |
| GET | `/api/data` | 全量数据（配置、余额、记录、每日数据） | ✅ |
| POST | `/api/day` | 保存某日奖励/惩罚 | ✅ |
| POST | `/api/exchange` | 商城兑换 | ✅ |
| POST | `/api/config` | 更新项目配置 | ✅ |

首次默认数据来自《喜宝家庭奖惩积分表.xlsx》。
