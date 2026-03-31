import React, { useState, useEffect } from 'react'
import { Card, Form, Select, InputNumber, Button, Row, Col, Descriptions, Alert, Input } from 'antd'
import { ShoppingOutlined, UserOutlined } from '@ant-design/icons'
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

interface Service {
  id: number
  name: string
  category: string
  price: number
  vip_price: number
  diamond_price: number
  status: string
}

interface Employee {
  id: number
  name: string
}

// interface Transaction {
//   id: number
//   member_name: string
//   member_phone: string
//   service_name: string
//   amount: number
//   transaction_type: string
//   created_at: string
//   remark: string
// }

const Consumption: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [defaultOperatorId, setDefaultOperatorId] = useState<number | null>(null)
  const [currentPaymentType, setCurrentPaymentType] = useState<string>('haircut')
  const [currentHaircutCount, setCurrentHaircutCount] = useState<number>(1)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [membersResult, servicesResult, employeesResult] = await Promise.all([
        window.electronAPI.getMembers(),
        window.electronAPI.getServices(),
        window.electronAPI.getEmployees(),
      ])

      if (membersResult.success && membersResult.data) {
        const filteredMembers = membersResult.data.filter((m: Member) => m.status === '正常')
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
      }

      if (servicesResult.success && servicesResult.data) {
        setServices(servicesResult.data.filter((s: Service) => s.status === '启用'))
      }

      if (employeesResult.success && employeesResult.data) {
        setEmployees(employeesResult.data)
        // 默认选择第一个员工
        if (employeesResult.data.length > 0) {
          const defaultId = employeesResult.data[0].id
          setDefaultOperatorId(defaultId)
          form.setFieldsValue({ operator: defaultId })
        }
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      toast.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleMemberChange = (memberId: number) => {
    const member = members.find((m) => m.id === memberId)
    setSelectedMember(member || null)
    form.setFieldsValue({ serviceId: undefined, amount: undefined })
    setSelectedService(null)
  }

  const handleServiceChange = (serviceId: number) => {
    const service = services.find((s) => s.id === serviceId)
    setSelectedService(service || null)

    if (service && selectedMember) {
      let price = service.price
      if (selectedMember.level === 'VIP会员' && service.vip_price) {
        price = service.vip_price
      } else if (selectedMember.level === '钻石会员' && service.diamond_price) {
        price = service.diamond_price
      }

      form.setFieldsValue({ amount: price })
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      if (!selectedMember || !selectedService) {
        toast.error('请选择会员和服务项目')
        return
      }

      const price = calculatePrice()
      const paymentType = values.paymentType || 'haircut'
      const haircutCountToDeduct = values.haircutCount || 1

      // 检查余额或基础剪发次数
      if (paymentType === 'money') {
        if (selectedMember.balance < price) {
          toast.error('会员余额不足')
          return
        }
      } else {
        // 抵扣基础剪发次数
        const haircutCount = selectedMember.basic_haircut_count || 0
        if (haircutCount < haircutCountToDeduct) {
          toast.error('基础剪发次数不足')
          return
        }
      }

      setLoading(true)
      const result = await window.electronAPI.createTransaction({
        memberId: selectedMember.id,
        serviceId: selectedService.id,
        amount: paymentType === 'money' ? price : 0,
        paymentType: paymentType,
        haircutCountToDeduct: paymentType === 'haircut' ? haircutCountToDeduct : 0,
        remark: values.remark || '',
        operatorId: values.operator
      })

      if (result.success) {
        toast.success('消费扣费成功')
        form.resetFields()
        form.setFieldsValue({ paymentType: 'haircut', haircutCount: 1, operator: defaultOperatorId })
        setSelectedMember(null)
        setSelectedService(null)
        loadData() // 重新加载数据以更新余额和交易记录
      } else {
        toast.error(result.error || '消费扣费失败')
      }
    } catch (error) {
      console.error('消费扣费失败:', error)
      toast.error('消费扣费失败')
    } finally {
      setLoading(false)
    }
  }

  const getServicePrice = () => {
    if (!selectedService || !selectedMember) return 0

    let price = selectedService.price
    if (selectedMember.level === 'VIP会员' && selectedService.vip_price) {
      price = selectedService.vip_price
    } else if (selectedMember.level === '钻石会员' && selectedService.diamond_price) {
      price = selectedService.diamond_price
    }

    return price
  }

  const calculatePrice = () => {
    if (!selectedMember || !selectedService) return 0

    switch (selectedMember.level) {
      case 'VIP会员':
        return selectedService.vip_price || selectedService.price
      case '钻石会员':
        return selectedService.diamond_price || selectedService.price
      default:
        return selectedService.price
    }
  }

  return (
    <div className="page-container">
      <h1>消费扣费</h1>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <Card title="消费信息" loading={loading}>
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
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
                      {member.name} ({member.phone}) - 余额: ¥{member.balance.toFixed(2)} - 剪发: {member.basic_haircut_count || 0}次
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="paymentType"
                label="扣费方式"
                initialValue="haircut"
              >
                <Select onChange={(value) => {
                  setCurrentPaymentType(value)
                  if (value === 'haircut') {
                    form.setFieldsValue({ amount: undefined })
                  } else if (selectedService) {
                    form.setFieldsValue({ amount: calculatePrice(), haircutCount: 1 })
                  } else {
                    form.setFieldsValue({ haircutCount: 1 })
                  }
                }}>
                  <Option value="money">抵扣账户余额</Option>
                  <Option value="haircut">抵扣基础剪发次数</Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.paymentType !== curr.paymentType}
              >
                {() => {
                  const paymentType = form.getFieldValue('paymentType')
                  if (paymentType === 'haircut') {
                    return (
                      <Form.Item
                        name="haircutCount"
                        label="抵扣次数"
                        initialValue={1}
                      >
                        <InputNumber
                          placeholder="请输入抵扣次数"
                          min={1}
                          precision={0}
                          defaultValue={1}
                          style={{ width: '100%' }}
                          addonAfter="次"
                          onChange={(value) => setCurrentHaircutCount(value || 1)}
                        />
                      </Form.Item>
                    )
                  }
                  return null
                }}
              </Form.Item>

              <Form.Item
                name="serviceId"
                label="选择服务项目"
                rules={[{ required: true, message: '请选择服务项目' }]
              }
              >
                <Select
                  placeholder="请选择服务项目"
                  showSearch
                  optionFilterProp="children"
                  onChange={handleServiceChange}
                  disabled={!selectedMember}
                >
                  {services.map((service) => (
                    <Option key={service.id} value={service.id}>
                      {service.name} - ¥{service.price.toFixed(2)}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.paymentType !== curr.paymentType}
              >
                {() => {
                  const paymentType = form.getFieldValue('paymentType')
                  if (paymentType === 'money') {
                    return (
                      <Form.Item
                        name="amount"
                        label="消费金额"
                        rules={[{ required: true, message: '请输入消费金额' }]}
                      >
                        <InputNumber
                          placeholder="请输入消费金额"
                          min={0}
                          precision={2}
                          style={{ width: '100%' }}
                          addonAfter="元"
                          disabled={!selectedService}
                        />
                      </Form.Item>
                    )
                  }
                  return null
                }}
              </Form.Item>

              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={3} placeholder="请输入备注信息" />
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

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<ShoppingOutlined />}
                  loading={loading}
                  disabled={!selectedMember || !selectedService}
                  block
                >
                  确认扣费
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

          {selectedService && (
            <Card title="服务信息" style={{ marginTop: 16 }}>
              <Descriptions column={1} bordered>
                <Descriptions.Item label="服务名称">{selectedService.name}</Descriptions.Item>
                <Descriptions.Item label="服务分类">{selectedService.category}</Descriptions.Item>
                <Descriptions.Item label="普通价格">
                  ¥{selectedService.price.toFixed(2)}
                </Descriptions.Item>
                {selectedService.vip_price && (
                  <Descriptions.Item label="VIP价格">
                    ¥{selectedService.vip_price.toFixed(2)}
                  </Descriptions.Item>
                )}
                {selectedService.diamond_price && (
                  <Descriptions.Item label="钻石价格">
                    ¥{selectedService.diamond_price.toFixed(2)}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="适用价格">
                  <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
                    ¥{getServicePrice().toFixed(2)}
                  </span>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          {selectedMember && selectedService && (
            <Card title="扣费预览" style={{ marginTop: 16 }}>
              <Alert
                message="扣费信息确认"
                description={
                  <div>
                    <p>会员：{selectedMember.name}</p>
                    <p>服务：{selectedService.name}</p>
                    {currentPaymentType === 'money' ? (
                      <>
                        <p>金额：¥{getServicePrice().toFixed(2)}</p>
                        <p>扣费后余额：¥{(selectedMember.balance - getServicePrice()).toFixed(2)}</p>
                      </>
                    ) : (
                      <p>抵扣次数：{currentHaircutCount}次（剩余：{selectedMember.basic_haircut_count - currentHaircutCount}次）</p>
                    )}
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

export default Consumption
