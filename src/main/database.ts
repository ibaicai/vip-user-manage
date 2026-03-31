import initSqlJs, { Database } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

/**
 * 数据库管理类
 * 使用 sql.js (WebAssembly SQLite)
 */
export class DatabaseManager {
  private db: Database | null = null
  private dbPath: string
  private SQL: any = null

  constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'barbershop.db')
    console.log('数据库路径:', this.dbPath)
    console.log('用户数据目录:', userDataPath)
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    // 获取 WASM 文件路径
    let wasmPath: string
    const isPackaged = app.isPackaged

    if (isPackaged) {
      wasmPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
    } else {
      wasmPath = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
    }

    console.log('WASM 路径:', wasmPath)
    console.log('WASM 文件存在:', fs.existsSync(wasmPath))

    // 初始化 SQL.js
    try {
      this.SQL = await initSqlJs({
        locateFile: (file: string) => {
          console.log('请求文件:', file)
          return wasmPath
        }
      })
      console.log('SQL.js 初始化成功')
    } catch (err) {
      console.error('SQL.js 初始化失败:', err)
      throw err
    }

    // 尝试加载已有数据库
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath)
      this.db = new this.SQL.Database(buffer)
      console.log('数据库加载成功')
    } else {
      this.db = new this.SQL.Database()
      console.log('新建数据库')
    }

    await this.createTables()
    await this.runMigrations()
    this.save()
  }

  /**
   * 保存数据库到文件
   */
  private save(): void {
    if (!this.db) {
      console.log('save: 数据库未初始化')
      return
    }
    console.log('保存数据库到:', this.dbPath)
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(this.dbPath, buffer)
      console.log('数据库保存成功, 大小:', buffer.length)
    } catch (err) {
      console.error('数据库保存失败:', err)
    }
  }

  /**
   * 创建数据表
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    const tables = [
      `CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        level TEXT DEFAULT '普通会员',
        balance DECIMAL(10,2) DEFAULT 0.00,
        basic_haircut_count INTEGER DEFAULT 0,
        register_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT '正常',
        avatar TEXT,
        remark TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        vip_price DECIMAL(10,2),
        diamond_price DECIMAL(10,2),
        status TEXT DEFAULT '启用',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        balance_before DECIMAL(10,2) NOT NULL,
        balance_after DECIMAL(10,2) NOT NULL,
        transaction_type TEXT NOT NULL,
        payment_type TEXT DEFAULT 'money',
        haircut_count_before INTEGER DEFAULT 0,
        haircut_count_after INTEGER DEFAULT 0,
        operator_id INTEGER,
        commission_amount DECIMAL(10,2) DEFAULT 0,
        remark TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (member_id) REFERENCES members(id),
        FOREIGN KEY (service_id) REFERENCES services(id),
        FOREIGN KEY (operator_id) REFERENCES employees(id)
      )`,

      `CREATE TABLE IF NOT EXISTS recharges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        recharge_type TEXT DEFAULT 'money',
        haircut_count INTEGER DEFAULT 0,
        payment_method TEXT DEFAULT '现金',
        operator_id INTEGER,
        commission_amount DECIMAL(10,2) DEFAULT 0,
        remark TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (member_id) REFERENCES members(id),
        FOREIGN KEY (operator_id) REFERENCES employees(id)
      )`,

      `CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        entry_date DATE,
        recharge_commission REAL DEFAULT 0,
        remark TEXT,
        status TEXT DEFAULT '在职',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS project_commissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        commission DECIMAL(5,2) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES services(id),
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )`,

      // 系统设置表
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ]

    for (const table of tables) {
      this.db.run(table)
    }

    await this.insertDefaultServices()
  }

  /**
   * 执行数据库迁移
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化')

    console.log('正在检查数据库结构更新...')

    try {
      const transactionsInfo = this.db.exec('PRAGMA table_info(transactions)')
      const hasOperatorId = transactionsInfo[0]?.values?.some((col: any) => col[1] === 'operator_id')
      if (!hasOperatorId) {
        this.db.run('ALTER TABLE transactions ADD COLUMN operator_id INTEGER REFERENCES employees(id)')
        console.log('数据库升级: transactions 表已添加 operator_id 字段')
      }

      const rechargesInfo = this.db.exec('PRAGMA table_info(recharges)')
      const hasRechargesOperatorId = rechargesInfo[0]?.values?.some((col: any) => col[1] === 'operator_id')
      if (!hasRechargesOperatorId) {
        this.db.run('ALTER TABLE recharges ADD COLUMN operator_id INTEGER REFERENCES employees(id)')
        console.log('数据库升级: recharges 表已添加 operator_id 字段')
      }

      const employeesInfo = this.db.exec('PRAGMA table_info(employees)')
      const hasRechargeCommission = employeesInfo[0]?.values?.some((col: any) => col[1] === 'recharge_commission')
      if (!hasRechargeCommission) {
        this.db.run('ALTER TABLE employees ADD COLUMN recharge_commission REAL DEFAULT 0')
        console.log('数据库升级: employees 表已添加 recharge_commission 字段')
      }

      const transactionsCommissionInfo = this.db.exec('PRAGMA table_info(transactions)')
      const hasCommissionAmount = transactionsCommissionInfo[0]?.values?.some((col: any) => col[1] === 'commission_amount')
      if (!hasCommissionAmount) {
        this.db.run('ALTER TABLE transactions ADD COLUMN commission_amount DECIMAL(10,2) DEFAULT 0')
        console.log('数据库升级: transactions 表已添加 commission_amount 字段')
      }

      const rechargesCommissionInfo = this.db.exec('PRAGMA table_info(recharges)')
      const hasRechargesCommissionAmount = rechargesCommissionInfo[0]?.values?.some((col: any) => col[1] === 'commission_amount')
      if (!hasRechargesCommissionAmount) {
        this.db.run('ALTER TABLE recharges ADD COLUMN commission_amount DECIMAL(10,2) DEFAULT 0')
        console.log('数据库升级: recharges 表已添加 commission_amount 字段')
      }

      // 迁移: members 表添加 basic_haircut_count 字段
      const membersInfo = this.db.exec('PRAGMA table_info(members)')
      const hasBasicHaircutCount = membersInfo[0]?.values?.some((col: any) => col[1] === 'basic_haircut_count')
      if (!hasBasicHaircutCount) {
        this.db.run('ALTER TABLE members ADD COLUMN basic_haircut_count INTEGER DEFAULT 0')
        console.log('数据库升级: members 表已添加 basic_haircut_count 字段')
      }

      // 迁移: recharges 表添加 recharge_type 和 haircut_count 字段
      const hasRechargeType = rechargesCommissionInfo[0]?.values?.some((col: any) => col[1] === 'recharge_type')
      if (!hasRechargeType) {
        this.db.run('ALTER TABLE recharges ADD COLUMN recharge_type TEXT DEFAULT \'money\'')
        console.log('数据库升级: recharges 表已添加 recharge_type 字段')
      }

      const hasHaircutCount = rechargesCommissionInfo[0]?.values?.some((col: any) => col[1] === 'haircut_count')
      if (!hasHaircutCount) {
        this.db.run('ALTER TABLE recharges ADD COLUMN haircut_count INTEGER DEFAULT 0')
        console.log('数据库升级: recharges 表已添加 haircut_count 字段')
      }

      // 迁移: transactions 表添加 payment_type 和 haircut_count 字段
      const transactionsPaymentInfo = this.db.exec('PRAGMA table_info(transactions)')
      const hasPaymentType = transactionsPaymentInfo[0]?.values?.some((col: any) => col[1] === 'payment_type')
      if (!hasPaymentType) {
        this.db.run('ALTER TABLE transactions ADD COLUMN payment_type TEXT DEFAULT \'money\'')
        console.log('数据库升级: transactions 表已添加 payment_type 字段')
      }

      const hasHaircutCountBefore = transactionsPaymentInfo[0]?.values?.some((col: any) => col[1] === 'haircut_count_before')
      if (!hasHaircutCountBefore) {
        this.db.run('ALTER TABLE transactions ADD COLUMN haircut_count_before INTEGER DEFAULT 0')
        console.log('数据库升级: transactions 表已添加 haircut_count_before 字段')
      }

      const hasHaircutCountAfter = transactionsPaymentInfo[0]?.values?.some((col: any) => col[1] === 'haircut_count_after')
      if (!hasHaircutCountAfter) {
        this.db.run('ALTER TABLE transactions ADD COLUMN haircut_count_after INTEGER DEFAULT 0')
        console.log('数据库升级: transactions 表已添加 haircut_count_after 字段')
      }
    } catch (error) {
      console.error('数据库迁移失败:', error)
    }
  }

  /**
   * 插入默认服务项目
   */
  private async insertDefaultServices(): Promise<void> {
    const defaultServices = [
      { name: '剪发', category: '剪发', price: 30.00, vip_price: 25.00, diamond_price: 20.00 },
      { name: '染发', category: '染发', price: 150.00, vip_price: 130.00, diamond_price: 110.00 },
      { name: '烫发', category: '烫发', price: 200.00, vip_price: 180.00, diamond_price: 160.00 },
      { name: '护理', category: '护理', price: 80.00, vip_price: 70.00, diamond_price: 60.00 },
      { name: '造型', category: '造型', price: 50.00, vip_price: 45.00, diamond_price: 40.00 }
    ]

    const result = this.db!.exec('SELECT name FROM services')
    const existingNames = result[0]?.values?.map((row: any) => row[0]) || []
    const newServices = defaultServices.filter(s => !existingNames.includes(s.name))

    if (newServices.length > 0) {
      console.log(`插入 ${newServices.length} 个新的默认服务项目`)
      for (const service of newServices) {
        this.db!.run(
          'INSERT INTO services (name, category, price, vip_price, diamond_price) VALUES (?, ?, ?, ?, ?)',
          [service.name, service.category, service.price, service.vip_price, service.diamond_price]
        )
      }
    } else {
      console.log('所有默认服务项目已存在，跳过插入')
    }
  }

  /**
   * 执行SQL语句 (INSERT/UPDATE/DELETE)
   */
  async run(sql: string, params: any[] = []): Promise<any> {
    if (!this.db) throw new Error('数据库未初始化')

    try {
      // 将 undefined 转换为 null
      const processedParams = params.map(p => p === undefined ? null : p)
      console.log('执行 SQL:', sql, processedParams)
      this.db.run(sql, processedParams)
      const result = this.db.exec('SELECT last_insert_rowid() as id, changes() as changes')
      this.save()
      return {
        id: result[0]?.values?.[0]?.[0] || 0,
        changes: this.db.getRowsModified()
      }
    } catch (err) {
      console.error('SQL执行错误:', err)
      throw err
    }
  }

  /**
   * 查询单条记录
   */
  async get(sql: string, params: any[] = []): Promise<any> {
    if (!this.db) throw new Error('数据库未初始化')

    try {
      const processedParams = params.map(p => p === undefined ? null : p)
      const stmt = this.db.prepare(sql)
      stmt.bind(processedParams)
      if (stmt.step()) {
        const row = stmt.getAsObject()
        stmt.free()
        return row
      }
      stmt.free()
      return null
    } catch (err) {
      console.error('SQL查询错误:', err)
      throw err
    }
  }

  /**
   * 查询多条记录
   */
  async all(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.db) throw new Error('数据库未初始化')

    try {
      const processedParams = params.map(p => p === undefined ? null : p)
      const stmt = this.db.prepare(sql)
      stmt.bind(processedParams)
      const results: any[] = []
      while (stmt.step()) {
        results.push(stmt.getAsObject())
      }
      stmt.free()
      return results
    } catch (err) {
      console.error('SQL查询错误:', err)
      throw err
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.save()
      this.db.close()
      console.log('数据库连接已关闭')
    }
  }

  getDbPath(): string {
    if (!this.dbPath) {
      throw new Error('数据库路径未设置')
    }
    return this.dbPath
  }

  /**
   * 获取设置值
   */
  async getSetting(key: string): Promise<string | null> {
    const result = await this.get('SELECT value FROM settings WHERE key = ?', [key])
    return result?.value || null
  }

  /**
   * 设置值
   */
  async setSetting(key: string, value: string): Promise<void> {
    await this.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    )
  }

  /**
   * 获取所有设置
   */
  async getAllSettings(): Promise<Record<string, string>> {
    const results = await this.all('SELECT key, value FROM settings')
    const settings: Record<string, string> = {}
    for (const row of results) {
      settings[row.key] = row.value
    }
    return settings
  }
}

// 创建全局数据库实例
export const dbManager = new DatabaseManager()