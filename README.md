# MemberLite - 理发店会员消费管理系统

<div align="center">

[![Electron](https://img.shields.io/badge/Electron-%231788FF.svg?style=flat&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-%2320232a.svg?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC.svg?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/IfFaith/MemberLite)](https://github.com/IfFaith/MemberLite/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](https://github.com/IfFaith/MemberLite)

</div>

> 基于 Electron + Vite 开发的桌面应用程序，专为小门店设计，用于管理会员信息、会员余额和消费记录。

## 功能特性

| 模块 | 功能 |
|------|------|
| **会员管理** | 会员信息录入、查询筛选、状态管理、导出 |
| **余额管理** | 会员充值、余额查询、消费扣费、余额提醒 |
| **服务项目** | 服务配置、会员等级价格、启用/禁用 |
| **消费记录** | 消费统计、报表生成、趋势分析 |
| **员工管理** | 员工信息、分红设置 |
| **系统设置** | 店铺信息、数据备份、密码修改 |

## 快速开始

### 环境要求

- Node.js 16+
- npm 或 pnpm

### 安装运行

```bash
# 克隆项目
git clone https://github.com/IfFaith/MemberLite.git
cd MemberLite

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 打包应用
pnpm build
pnpm dist
```

### 首次使用

1. **登录系统**
   - 账号：`admin`
   - 密码：`123456`

2. **基础配置**
   - 进入「系统设置」配置店铺信息
   - 添加服务项目（剪发、染发、护理等）

## 技术栈

<div align="center">

| 层级 | 技术 |
|------|------|
| 框架 | Electron + Vite |
| 前端 | React + Ant Design |
| 语言 | TypeScript |
| 数据库 | SQLite（本地存储） |
| 打包 | electron-builder |

</div>

## 项目结构

```
src/
├── main/                 # 主进程
│   ├── index.ts         # 入口文件
│   ├── database.ts     # 数据库管理
│   └── handles.ts      # IPC 处理器
├── preload/             # 预加载脚本
│   └── index.ts         # API 暴露
└── renderer/            # 渲染进程
    └── src/
        ├── components/  # 公共组件
        ├── pages/       # 页面组件
        ├── types/       # 类型定义
        ├── assets/      # 静态资源
        └── App.tsx      # 应用入口
```

## 注意事项

- 数据本地存储，定期备份数据库文件
- 替换 `resources/icon.png` 可自定义窗口图标
- 将图标转换为 `.ico` 格式可自定义安装包图标

## 开发团队

[lixp](https://github.com/IfFaith)

## 许可证

[MIT](LICENSE)

## 联系方式

- GitHub: https://github.com/IfFaith
- Email: 13283029823@163.com