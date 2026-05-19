Jira Worklog Agent - 工时自动记录助手
============================================

安装已完成！

首次使用步骤：
-------------

1. 配置 Jira Token
   - 打开安装目录中的 .env 文件
   - 设置以下配置：
     JIRA_SERVER=https://your-company.atlassian.net/
     JIRA_API_TOKEN=your-api-token

   如何获取 API Token：
   - 登录 Jira → 个人设置 → Personal access tokens
   - 创建新 Token 并复制到 .env 文件

2. 启动程序
   - 双击桌面快捷方式 "Jira Worklog Agent"
   - 或从开始菜单运行

3. 打开界面
   - 程序启动后自动打开 http://localhost:7301
   - 如未自动打开，手动访问该地址

功能说明：
---------

✅ 每天下午 17:00 自动弹出桌面提醒
✅ 自动推荐最近使用的 tickets
✅ 智能分配 8 小时工时
✅ 支持手动搜索添加 ticket
✅ 查看历史工时记录

配置文件位置：
-------------
- config.yaml - 主配置文件
- .env - Jira Token 配置
- data/ - 数据存储目录

端口设置：
---------
- API 端口: 7301
- UI 端口: 7302 (开发模式)

问题反馈：
---------
https://github.com/jxi/jira-worklog-agent/issues