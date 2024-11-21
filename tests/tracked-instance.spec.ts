import {useTrackedInstance} from '../src'
import {describe, expect, it} from 'vitest'

describe('useTrackedInstance', async () => {
  it('should change data', async () => {
    const instance = useTrackedInstance({
      name: 'John',
      age: 22,
    })
    expect(instance.isDirty.value).eq(false)
    expect(instance.changedData.value).undefined
    
    instance.data.value.name = 'test'
    
    expect(instance.isDirty.value).eq(true)
    expect(instance.changedData.value).deep.eq({
      name: 'test',
    })
    
    instance.data.value.name = 'John'
    expect(instance.isDirty.value).eq(false)
  })
  
  it('should accept primitive value as root', async () => {
    const instance = useTrackedInstance('John')
    instance.data.value = 'Jane'
    
    expect(instance.isDirty.value).eq(true)
    
    instance.reset()
    
    expect(instance.isDirty.value).eq(false)
    expect(instance.data.value).eq('John')
    
    instance.data.value = 'Tom'
    instance.loadData('Jack')
    
    expect(instance.isDirty.value).eq(false)
    expect(instance.data.value).eq('Jack')
  })
  
  it('should change array of string', async () => {
    const instance = useTrackedInstance({
      name: 'John',
      hobbies: ['drift'],
    })
    instance.data.value.hobbies.push('films')
    
    expect(instance.isDirty.value).eq(true)
    expect(instance.changedData.value).deep.eq({
      hobbies: [undefined, 'films'],
    })
  })
  
  it('should change nested value in object', async () => {
    const instance = useTrackedInstance({
      name: 'John',
      info: {
        contact: {
          phone: '1234567',
          address: 'Earth',
        },
      },
    })
    
    instance.data.value.info.contact.phone = 'none'
    expect(instance.changedData.value).deep.eq({
      info: {
        contact: {
          phone: 'none',
        },
      },
    })
  })
  
  it('should clean "changedData" after "loadData" ', async () => {
    const instance = useTrackedInstance({
      name: 'John',
      age: 22,
    })
    instance.data.value.name = 'none'
    instance.data.value.age = 0
    instance.loadData({
      name: 'Test',
      age: 100,
    })
    
    expect(instance.data.value).deep.eq({
      name: 'Test',
      age: 100,
    })
    expect(instance.isDirty.value).eq(false)
    expect(instance.changedData.value).undefined
  })
  
  it('should reset data after do some change', async () => {
    const instance = useTrackedInstance({
      name: 'John',
      info: {
        contact: {
          phone: '1234567',
          address: 'Earth',
        },
      },
      hobbies: ['drift', 'films'],
    })
    instance.data.value.name = 'changed'
    instance.data.value.info.contact.phone = 'none'
    instance.data.value.hobbies.splice(0, 1, 'test', 'test2')
    instance.reset()
    
    expect(instance.data.value).deep.eq({
      name: 'John',
      info: {
        contact: {
          phone: '1234567',
          address: 'Earth',
        },
      },
      hobbies: ['drift', 'films'],
    })
    expect(instance.isDirty.value).eq(false)
    expect(instance.changedData.value).undefined
  })
  
  it('should display correct changedData after replace some value as object', async () => {
    const instance = useTrackedInstance<{
      contact: null | {
        phone: string
        galaxy: string
        address?: string
      }
      user: null | {
        name: string
      }
    }>({
      contact: {
        phone: '123',
        galaxy: 'Milky way',
        address: 'Earth',
      },
      user: null,
    })
    
    instance.data.value.contact = null
    
    instance.data.value.contact = {
      phone: '1',
      galaxy: 'Milky way',
    }
    expect(instance.changedData.value).deep.eq({
      contact: {
        phone: '1',
        address: undefined,
      },
    })
    
    instance.data.value.contact = {
      phone: '123',
      galaxy: 'Milky way',
      address: 'Earth',
    }
    expect(instance.isDirty.value).eq(false)
    
    instance.data.value.user = {
      name: 'Jack',
    }
    instance.data.value.user.name = 'John'
    expect(instance.changedData.value).deep.eq({
      user: {
        name: 'John',
      },
    })
  })
  
  it('should make whole object prop undefined', async () => {
    const instance = useTrackedInstance<{
      name?: string
      info?: Record<string, string>
    }>({
      name: 'John',
      info: {
        phone: '1234567',
        address: 'Earth',
      },
    })
    instance.data.value.name = undefined
    instance.data.value.info = undefined
    
    expect(instance.changedData.value).deep.eq({
      name: undefined,
      info: undefined,
    })
  })
  
  it('should replace primitive value as new object', async () => {
    const instance = useTrackedInstance<{
      user: string | { name: string }
    }>({
      user: 'John',
    })
    instance.data.value.user = 'Jack'
    
    expect(instance.changedData.value).deep.eq({
      user: 'Jack',
    })
    
    instance.data.value.user = {
      name: 'Peter',
    }
    
    expect(instance.changedData.value).deep.eq({
      user: {name: 'Peter'},
    })
    
    instance.reset()
    expect(instance.data.value).deep.eq({
      user: 'John',
    })
    expect(instance.isDirty.value).eq(false)
  })
  
  it('should replace object value as new object', async () => {
    const instance = useTrackedInstance<{
      info: {
        address: string
        phone?: string
        passport: {
          id: number
          country?: string
          year?: number
          owner?: string
        }
      }
    }>({
      info: {
        address: 'Earth',
        phone: '1234567',
        passport: {
          id: 1,
          year: 2000,
        },
      },
    })
    instance.data.value.info.address = 'Mars'
    
    expect(instance.changedData.value).deep.eq({
      info: {
        address: 'Mars',
      },
    })
    
    instance.data.value.info = {
      address: 'Earth',
      passport: {
        id: 2,
        country: 'Ukraine',
        owner: 'Jack',
      },
    }
    
    instance.data.value.info = {
      address: 'Earth',
      passport: {
        id: 2,
        country: 'Ukraine',
      },
    }
    
    expect(instance.changedData.value).deep.eq({
      info: {
        phone: undefined,
        passport: {
          id: 2,
          year: undefined,
          country: 'Ukraine',
        },
      },
    })
    
    instance.reset()
    
    expect(instance.changedData.value).undefined
    expect(instance.data.value).deep.eq({
      info: {
        address: 'Earth',
        phone: '1234567',
        passport: {
          id: 1,
          year: 2000,
        },
      },
    })
  })
  
  it('should display correct changedData when change nested value in array of objects', async () => {
    const instance = useTrackedInstance<{ id: number; name: string }[]>([
      {
        id: 1,
        name: 'John',
      },
      {
        id: 2,
        name: 'Jack',
      },
    ])
    
    instance.data.value[1].name = 'Joe'
    const expectedData = []
    expectedData[1] = {name: 'Joe'}
    expect(instance.changedData.value).deep.eq(expectedData)
  })
  
  it('shouldn\'t change File or Date types', () => {
    const instance = useTrackedInstance<{ file?: File; date?: Date }>({})
    instance.data.value.file = new File(['content'], 'test.txt')
    instance.data.value.date = new Date()
    expect(instance.changedData.value.file).instanceOf(File)
    expect(instance.changedData.value.date).instanceOf(Date)
  })
  
  it('should copy input data to prevent external mutations', () => {
    const externalObject = {name: 'John'}
    const instance = useTrackedInstance()
    instance.data.value = externalObject
    externalObject.name = 'Jack'
    
    expect(externalObject.name).eq( 'Jack')
    expect(instance.data.value.name).eq( 'John')
    
    const externalArray = [1]
    instance.data.value = externalArray
    externalArray.pop()
    
    expect(externalArray.length).eq( 0)
    expect(instance.data.value.length).eq( 1)
  })
})
