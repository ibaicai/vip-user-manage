import React, { useState, useEffect } from 'react'
import { Card, Form, Select, InputNumber, Button, Row, Col, Descriptions, Alert, Input } from 'antd'
import { WalletOutlined, UserOutlined } from '@ant-design/icons'
import { toast } from '../components/Toast'

const { Option } = Select

interface Member {
  id: number
  name: string
  phone: string
  level: string
  balance: number
  basic_haircut_count: number
  status: string
}

// interface RechargeRecord {
//   id: number
//   member_name: string
//   member_phone: string
//   amount: number
//   payment_method: string
//   operator: string
//   created_at: string
//   remark: string
// }

const Recharge: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  // const [rechargeRecords, setRechargeRecords] = useState<RechargeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const [employees, setEmployees] = useState<any[]>([])
  const [defaultOperatorId, setDefaultOperatorId] = useState<number | null>(null)

  useEffect(() => {
    loadMembers()
    // loadRechargeRecords()
    const fetchEmployees = async () => {
      const result = await window.electronAPI.getEmployees()
      if (result.success && result.data) {
        setEmployees(result.data)
        // 默认选择第一个员工
        if (result.data.length > 0) {
          const defaultId = result.data[0].id
          setDefaultOperatorId(defaultId)
          form.setFieldsValue({ operator: defaultId })
        }
      }
    }
    fetchEmployees()
  }, [])

  const loadMembers = async () => {
    try {
      const result = await window.electronAPI.getMembers()
      if (result.success && result.data) {
        const filteredMembers = result.data.filter((m: Member) => m.status === '正常')
        setMembers(filteredMembers)

        // 检查 URL 参数，自动选中会员
        const params = new URLSearchParams(window.location.search)
        const memberId = params.get('memberId')
        if (memberId) {
          const member = filteredMembers.find((m: Member) => m.id === Number(memberId))
          if (member) {
            setSelectedMember(member)
            form.setFieldsValue({ memberId: member.id })
          }
        }
      } else {
        toast.error('加载会员数据失败')
      }
    } catch (error) {
      console.error('加载会员失败:', error)
      toast.error('加载会员数据失败')
    } finally {
      setLoading(false)
    }
  }

  // const loadRechargeRecords = async () => {
  //   try {
  //     const result = await window.electronAPI.getRecharges()
  //     if (result.success && result.data) {
  //       setRechargeRecords(result.data)
  //     } else {
  //       toast.error('加载充值记录失败')
  //     }
  //   } catch (error) {
  //     console.error('加载充值记录失败:', error)
  //     toast.error('加载充值记录失败')
  //   }
  // }

  const handleMemberChange = (memberId: number) => {
    const member = members.find((m) => m.id === memberId)
    setSelectedMember(member || null)
    form.setFieldsValue({ amount: undefined })
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      if (!selectedMember) {
        toast.error('请选择会员')
        return
      }

      const accountType = values.accountType || 'balance'

      if (accountType === 'balance' && (!values.amount || values.amount <= 0)) {
        toast.error('充值金额必须大于0')
        return
      }

      if (accountType === 'haircut' && (!values.haircutCount || values.haircutCount <= 0)) {
        toast.error('剪发次数必须大于0')
        return
      }

      setLoading(true)
      // 将accountType映射为API需要的rechargeType
      const apiRechargeType = accountType === 'balance' ? 'money' : 'haircut'
      const result = await window.electronAPI.createRecharge({
        memberId: selectedMember.id,
        amount: accountType === 'balance' ? values.amount : 0,
        rechargeType: apiRechargeType,
        haircutCount: accountType === 'haircut' ? values.haircutCount : 0,
        paymentMethod: values.paymentMethod || '现金',
        operatorId: values.operator,
        remark: values.remark || ''
      })

      if (result.success) {
        toast.success('充值成功')
        form.resetFields()
        form.setFieldsValue({ accountType: 'haircut', operator: defaultOperatorId })
        setSelectedMember(null)
        loadMembers() // 重新加载数据以更新余额
        // loadRechargeRecords() // 重新加载充值记录
      } else {
        toast.error(result.error || '充值失败')
      }
    } catch (error) {
      console.error('充值失败:', error)
      toast.error('充值失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container">
      <h1>会员充值</h1>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <Card title="充值信息" loading={loading}>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                paymentMethod: '现金',
                operator: '',
                accountType: 'haircut'
              }}
            >
              <Form.Item
                name="memberId"
                label="选择会员"
                rules={[{ required: true, message: '请选择会员' }]}
              >
                <Select
                  placeholder="请选择会员"
                  showSearch
                  optionFilterProp="children"
                  onChange={handleMemberChange}
                  loading={loading}
                >
                  {members.map((member) => (
                    <Option key={member.id} value={member.id}>
                      {member.name} ({member.phone}) - 余额: ¥{member.balance.toFixed(2)} - 剪发次数: {member.basic_haircut_count || 0}次
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="amount"
                label="充值金额"
                rules={[
                  { required: true, message: '请输入充值金额' },
                  { type: 'number', min: 0.01, message: '充值金额必须大于0' }
                ]}
              >
                <InputNumber
                  placeholder="请输入充值金额"
                  min={0.01}
                  precision={2}
                  style={{ width: '100%' }}
                  addonAfter="元"
                  onChange={() => {
                    // 选择金额后自动选中到账类型
                    if (!form.getFieldValue('accountType')) {
                      form.setFieldsValue({ accountType: 'haircut' })
                    }
                  }}
                />
              </Form.Item>

              <Form.Item
                name="accountType"
                label="到账类型"
                initialValue="haircut"
              >
                <Select onChange={(value) => {
                  if (value === 'haircut') {
                    form.setFieldsValue({ haircutCount: 1 })
                  } else {
                    form.setFieldsValue({ haircutCount: undefined })
                  }
                }}>
                  <Option value="balance">余额</Option>
                  <Option value="haircut">剪发次数</Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.accountType !== curr.accountType}
              >
                {() => {
                  const accountType = form.getFieldValue('accountType')
                  if (accountType === 'haircut') {
                    return (
                      <Form.Item
                        name="haircutCount"
                        label="剪发次数"
                        rules={[{ required: true, message: '请输入剪发次数' }]}
                      >
                        <InputNumber
                          placeholder="请输入剪发次数"
                          min={1}
                          precision={0}
                          style={{ width: '100%' }}
                          addonAfter="次"
                        />
                      </Form.Item>
                    )
                  }
                  return null
                }}
              </Form.Item>

              <Form.Item
                name="paymentMethod"
                label="支付方式"
                rules={[{ required: true, message: '请选择支付方式' }]}
              >
                <Select placeholder="请选择支付方式">
                  <Option value="现金">现金</Option>
                  <Option value="微信">微信</Option>
                  <Option value="支付宝">支付宝</Option>
                  <Option value="银行卡">银行卡</Option>
                  <Option value="其他">其他</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="operator"
                label="操作员"
                rules={[{ required: true, message: '请选择操作员' }]}
              >
                <Select placeholder="请选择操作员">
                  {employees.map((emp) => (
                    <Select.Option key={emp.id} value={emp.id}>
                      {emp.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={3} placeholder="请输入备注信息" />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<WalletOutlined />}
                  loading={loading}
                  disabled={!selectedMember}
                  block
                >
                  确认充值
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="会员信息" loading={loading}>
            {selectedMember ? (
              <Descriptions column={1} bordered>
                <Descriptions.Item label="姓名">{selectedMember.name}</Descriptions.Item>
                <Descriptions.Item label="手机号">{selectedMember.phone}</Descriptions.Item>
                <Descriptions.Item label="会员等级">{selectedMember.level}</Descriptions.Item>
                <Descriptions.Item label="当前余额">
                  <span style={{ color: selectedMember.balance > 0 ? '#52c41a' : '#ff4d4f' }}>
                    ¥{selectedMember.balance.toFixed(2)}
                  </span>
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <div style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>
                <UserOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <p>请先选择会员</p>
              </div>
            )}
          </Card>

          {selectedMember && (
            <Card title="充值预览" style={{ marginTop: 16 }}>
              <Alert
                message="充值信息确认"
                description={
                  <div>
                    <p>会员：{selectedMember.name}</p>
                    <p>当前余额：¥{selectedMember.balance.toFixed(2)}</p>
                    <p>
                      充值后余额：¥
                      {(selectedMember.balance + (form.getFieldValue('amount') || 0)).toFixed(2)}
                    </p>
                  </div>
                }
                type="info"
                showIcon
              />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  )
}

export default Recharge
