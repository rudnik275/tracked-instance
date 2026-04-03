import {useCollection} from '../src'
import {beforeEach, describe, expect, it} from 'vitest'

const nullEqualsEmpty = (a: unknown, b: unknown) => (a ?? '') === (b ?? '')

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
        {name: 'user'},
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
    let collection: ReturnType<typeof useCollection<Person>>

    beforeEach(() => {
      collection = useCollection<Person>()
      collection.loadData([{name: 'admin'}, {name: 'user'}])
      collection.items.value[0].instance.data.value.name = 'admin2'
      collection.add({name: 'new user'})
      collection.remove(0)
      collection.reset()
    })

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

  describe('remove', () => {
    describe('by index', () => {
      let collection: ReturnType<typeof useCollection<Person>>

      beforeEach(() => {
        collection = useCollection<Person>()
        collection.loadData([{name: 'admin'}, {name: 'user'}])
        collection.add({name: 'new user'})
        collection.remove(2)
        collection.remove(1)
        collection.remove(0, true)
      })

      it('Should delete new items when removing it and remove hard removed', () => {
        expect(collection.items.value[0].instance.data.value.name).equal('user')
        expect(collection.items.value[0].isRemoved.value).equal(true)
        expect(collection.items.value[1]).undefined
      })
    })
    describe('by collection item method', () => {
      let collection: ReturnType<typeof useCollection<Person>>

      beforeEach(() => {
        collection = useCollection<Person>()
        collection.loadData([{name: 'admin'}, {name: 'user'}])
        collection.add({name: 'new user'})
        collection.items.value[2].remove()
        collection.items.value[1].remove()
        collection.items.value[0].remove(true)
      })

      it('Should delete new items when removing it and remove hard removed', () => {
        expect(collection.items.value[0].instance.data.value.name).equal('user')
        expect(collection.items.value[0].isRemoved.value).equal(true)
        expect(collection.items.value[1]).undefined
      })
    })
  })

  describe('loadData', () => {
    let collection: ReturnType<typeof useCollection<Person>>

    beforeEach(() => {
      collection = useCollection<Person>()
      collection.loadData([{name: 'admin'}, {name: 'user'}])
    })

    it('Should load correct data', () => {
      expect(collection.items.value.map((item) => item.instance.data.value)).to.deep.equal([
        {name: 'admin'},
        {name: 'user'},
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

  describe('equals option', () => {
    it('should treat null and empty string as equal in collection items', () => {
      const collection = useCollection<{ comment: string | null }>({equals: nullEqualsEmpty})
      collection.loadData([{comment: null}])
      collection.items.value[0].instance.data.value.comment = ''
      expect(collection.items.value[0].instance.isDirty.value).equal(false)
      expect(collection.isDirty.value).equal(false)
    })

    it('should still detect real changes in collection items with equals option', () => {
      const collection = useCollection<{ comment: string | null }>({equals: nullEqualsEmpty})
      collection.loadData([{comment: null}])
      collection.items.value[0].instance.data.value.comment = 'hello'
      expect(collection.items.value[0].instance.isDirty.value).equal(true)
      expect(collection.isDirty.value).equal(true)
    })

    it('should apply equals to items added via add()', () => {
      const collection = useCollection<{ comment: string | null }>({equals: nullEqualsEmpty})
      const item = collection.add({comment: null})
      item.instance.data.value.comment = ''
      expect(item.instance.isDirty.value).equal(false)
    })
  })
})