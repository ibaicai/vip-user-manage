import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// import icon from '../../resources/icon.png?asset' // 不再使用此行
import { registerWebHandles } from './handles'
import { dbManager } from './database'

let handlesRegistered = false
let autoBackupTimer: NodeJS.Timeout | null = null

// 执行自动备份
async function performAutoBackup(): Promise<void> {
  try {
    const fs = require('fs')
    const path = require('path')
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'barbershop.db')
    const backupDir = path.join(userDataPath, 'backups')

    // 获取保留天数
    const retainDays = parseInt(await dbManager.getSetting('autoBackupRetainDays') || '30')

    // 创建备份目录
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    // 生成备份文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFileName = `barbershop_auto_backup_${timestamp}.db`
    const backupPath = path.join(backupDir, backupFileName)

    // 复制数据库文件
    fs.copyFileSync(dbPath, backupPath)
    console.log(`[自动备份] 备份成功: ${backupFileName}`)

    // 清理过期备份
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retainDays)

    const files = fs.readdirSync(backupDir).filter((file: string) => file.startsWith('barbershop_auto_backup_') && file.endsWith('.db'))
    let deletedCount = 0

    for (const file of files) {
      const filePath = path.join(backupDir, file)
      const stats = fs.statSync(filePath)
      if (new Date(stats.mtime) < cutoffDate) {
        fs.unlinkSync(filePath)
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      console.log(`[自动备份] 清理过期备份: ${deletedCount}个`)
    }
  } catch (error) {
    console.error('[自动备份] 备份失败:', error)
  }
}

// 启动/重启自动备份定时器
export async function setupAutoBackup(): Promise<void> {
  // 清除现有定时器
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer)
    autoBackupTimer = null
  }

  try {
    const enabled = await dbManager.getSetting('autoBackupEnabled')
    if (enabled !== 'true') {
      console.log('[自动备份] 未启用')
      return
    }

    const intervalMinutes = parseInt(await dbManager.getSetting('autoBackupInterval') || '30')
    const intervalMs = intervalMinutes * 60 * 1000

    console.log(`[自动备份] 已启用，间隔: ${intervalMinutes}分钟`)

    // 立即执行一次备份
    performAutoBackup()

    // 设置定时器
    autoBackupTimer = setInterval(performAutoBackup, intervalMs)
  } catch (error) {
    console.error('[自动备份] 设置失败:', error)
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 825,
    minHeight: 500,
    minWidth: 500,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    title: '貔貅会员消费管理系统',
    icon: join(__dirname, '../../resources/lixp.png'), // 统一设置icon
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })
  mainWindow.maximize()
  // mainWindow.webContents.openDevTools() // 自动打开控制台
  
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 只注册一次 IPC 处理器
  if (!handlesRegistered) {
    registerWebHandles()
    handlesRegistered = true
  }

  // 1. 先加载loading页面
  const loadingPath = join(__dirname, '../renderer/loading.html')
  mainWindow.loadFile(loadingPath)

  // 2. 延迟加载主页面，避免白屏
  setTimeout(() => {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      console.log('Loading development URL:', process.env['ELECTRON_RENDERER_URL'])
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      const rendererPath = join(__dirname, '../renderer/index.html')
      console.log('Loading production file:', rendererPath)
      mainWindow.loadFile(rendererPath)
    }
  }, 800) // 800ms后加载主页面
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // 初始化数据库
  try {
    await dbManager.initialize()
    console.log('数据库初始化成功')
    // 启动自动备份
    await setupAutoBackup()
  } catch (error) {
    console.error('数据库初始化失败:', error)
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出时关闭数据库连接
app.on('before-quit', () => {
  dbManager.close()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

