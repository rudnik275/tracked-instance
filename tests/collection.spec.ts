import {useCollection} from '../src'
import {describe, expect, it} from 'vitest'

interface Person {
  name: string
}

describe('Collection', () => {
  describe('Create', () => {
    it('Should add new item at index in data', () => {
      const collection = useCollection<Person>()
      collection.loadData([{name: 'admin'}, {name: 'user'}])
      collection.add({name: 'new user'}, 1)
      expect(collection.items.value.map((item) => item.instance.data.value)).to.deep.equal([
        {name: 'admin'},
        {name: 'new user'},
        {name: 'user'}
      ])
    })
  })

  describe('isDirty', () => {
    it('Should make collection dirty when some item is "isDirty"', () => {
      const collection = useCollection<Person>()
      collection.loadData([{name: 'admin'}, {name: 'user'}])
      collection.items.value[0].instance.data.value.name = 'changed name'
      expect(collection.isDirty.value).equal(true)
    })
    it('Should make collection dirty when some item is removed', () => {
      const collection = useCollection<Person>()
      collection.loadData([{name: 'admin'}, {name: 'user'}])
      collection.remove(0)
      expect(collection.isDirty.value).equal(true)
    })
    it('Should make collection dirty when some item is "isNew"', () => {
      const collection = useCollection<Person>()
      collection.loadData([{name: 'admin'}, {name: 'user'}])
      collection.add({name: 'new user'})
      expect(collection.isDirty.value).equal(true)
    })
  })

  describe('reset', () => {
    const collection = useCollection<Person>()
    collection.loadData([{name: 'admin'}, {name: 'user'}])
    collection.items.value[0].instance.data.value.name = 'admin2'
    collection.add({name: 'new user'})
    collection.remove(0)
    collection.reset()

    it(`Collection shouldn't dirty`, () => {
      expect(collection.isDirty.value).equal(false)
    })
    it('Should clean deleted items', () => {
      expect(collection.items.value.some((item) => item.isRemoved.value)).equal(false)
    })
    it('Should reset each item in data', () => {
      expect(collection.items.value.some((item) => item.instance.isDirty.value)).equal(false)
    })
    it('should revert deleted items', async () => {
      expect(collection.items.value.map((item) => item.instance.data.value)).deep.eq([{name: 'admin'}, {name: 'user'}])
    })
  })

  describe('delete', () => {
    const collection = useCollection<Person>()
    collection.loadData([{name: 'admin'}, {name: 'user'}])
    collection.add({name: 'new user'})
    collection.remove(2)
    collection.remove(1)

    it('Should delete new items when removing it', () => {
      expect(collection.items.value[0].instance.data.value.name).equal('admin')
      expect(collection.items.value[1].instance.data.value.name).equal('user')
      expect(collection.items.value[1].isRemoved.value).equal(true)
      expect(collection.items.value[2]).undefined
    })
  })

  describe('loadData', () => {
    const collection = useCollection<Person>()
    collection.loadData([{name: 'admin'}, {name: 'user'}])
    it('Should load correct data', () => {
      expect(collection.items.value.map((item) => item.instance.data.value)).to.deep.equal([
        {name: 'admin'},
        {name: 'user'}
      ])
    })
    it(`Loaded items shouldn't equals "isNew"`, () => {
      expect(collection.items.value.some((item) => item.instance.isDirty.value)).equal(false)
    })
    it('Should clean revert removed items', () => {
      collection.remove(1)
      collection.remove(0)
      collection.loadData([{name: 'admin'}, {name: 'user'}])
      expect(collection.items.value.some((item) => item.isRemoved.value)).equal(false)
    })
  })
})
