# ClawCompany 发布指南

## 版本号
每次发布前确认新版本号，替换所有 OLD_VERSION → NEW_VERSION

## 技术发布流程
```bash
cd ~/Projects/clawcompany
sed -i '' "s/\"version\": \"OLD\"/\"version\": \"NEW\"/" cli/package.json
sed -i '' "s/ClawCompany vOLD/ClawCompany vNEW/" cli/src/utils.ts
pnpm --filter clawcompany build
cd cli && npm publish --access public && cd ..
git add -A && git commit -m "release: npm vNEW — FEATURE_NAME" && git push
python3 -c "c=open('README.md').read().replace('vOLD','vNEW');open('README.md','w').write(c)"
git add -A && git commit -m "docs: README vNEW" && git push
cd ~/Projects/clawcompany-site
python3 -c "c=open('index.html').read().replace('vOLD','vNEW');open('index.html','w').write(c)"
npx vercel --prod
```

## 营销内容生成
输出到 marketing/releases/vNEW/

### X 文案规则
- 简洁有力，每行一个要点
- 结尾：🦞 clawcompany.org
- Hashtags: #AI #OpenSource #BuildInPublic #LocalFirst #YourMachineYourCompany
- 如有相关方可 @（工具方欢迎 @，大佬谨慎）
- 安全：不包含真实 API key 或 token

### Dev.to 文章规则
- 标题吸引眼球，技术向
- Tags: ai, opensource, buildinpublic, webdev
- 包含代码片段和截图引用
- 结尾 CTA: GitHub link + Website link
- 字数：800-1500 字

### Medium 文章规则
- 同 Dev.to 但语气更叙事，讲 build story
- 加入竞品对比（vs Paperclip）
- 目标投稿: Towards AI, Level Up Coding

### Outreach DM 规则
- 3-4 句话，简短直接
- 说清跟 Paperclip 区别：batteries-included, no BYOA, one command
- 附 GitHub + Website
- 目标: flowtivity.ai, topaiproduct.com, scriptbyai.com, allclaw.org, zeabur.com

### Checklist 生成规则
每次在 marketing/releases/vNEW/checklist.md 生成：
- [ ] X 发帖 → 复制 x-post.txt
- [ ] YouTube 同步视频
- [ ] Dev.to 发文 → 复制 devto.md
- [ ] Medium 发文 → 复制 medium.md
- [ ] AllClaw.org 提交
- [ ] scriptbyai.com 提交
- [ ] topaiproduct.com 联系
- [ ] Flowtivity DM
- [ ] Zeabur 合作 DM
- [ ] Product Hunt 更新（如已上线）
- [ ] Hacker News Show HN（仅重磅）

## 安全提醒
所有公开内容不得包含真实 API key、token、chat ID 或任何私人凭据。
