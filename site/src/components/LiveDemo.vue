<script setup lang="ts">
import {computed, onUnmounted, ref} from 'vue'
import {useCollection, useTrackedInstance} from 'tracked-instance'
import Icon from './Icon.vue'

interface Car {
  id: number | null
  model: string
  plate: string
}

const courier = useTrackedInstance({
  name: 'Marco Reyes',
  phone: '+34 612 480 774',
})

const cars = useCollection<Car>()
cars.loadData([
  {id: 1, model: 'Renault Kangoo', plate: 'B 4821 KX'},
  {id: 2, model: 'Ford Transit', plate: 'B 9034 TR'},
  {id: 3, model: 'Vespa Primavera', plate: 'B 112 VS'},
])

const data = courier.data
const rows = cars.items

const addCar = () => {
  cars.add({id: null, model: 'Piaggio Porter', plate: 'B 300 PP'})
}

// Stable per-row keys: new rows have id === null, and using an editable field
// as :key would remount the input on every keystroke
let nextRowKey = 0
const rowKeys = new WeakMap<object, number>()
const keyOf = (row: object) => {
  if (!rowKeys.has(row)) rowKeys.set(row, ++nextRowKey)
  return rowKeys.get(row)!
}

const isDirty = computed(() => courier.isDirty.value || cars.isDirty.value)

/* Each dirty node of the tree becomes its own request — the master form and
 * every car are separate entities in the backend, saved independently. */
interface PlannedRequest {
  method: 'PATCH' | 'POST' | 'DELETE'
  url: string
  body?: unknown
}

const requests = computed<PlannedRequest[]>(() => {
  const plan: PlannedRequest[] = []
  if (courier.isDirty.value) {
    plan.push({method: 'PATCH', url: '/couriers/17', body: courier.changedData.value})
  }
  for (const row of rows.value) {
    const car = row.instance.data.value
    if (row.isRemoved.value) {
      plan.push({method: 'DELETE', url: `/cars/${car.id}`})
    } else if (row.isNew.value) {
      const {id: _id, ...fields} = car
      plan.push({method: 'POST', url: '/cars', body: {courierId: 17, ...fields}})
    } else if (row.instance.isDirty.value) {
      plan.push({method: 'PATCH', url: `/cars/${car.id}`, body: row.instance.changedData.value})
    }
  }
  return plan
})

const byteSize = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

const planBytes = computed(() => byteSize(requests.value))
const fullBytes = computed(() => byteSize({
  ...data.value,
  cars: rows.value.filter(row => !row.isRemoved.value).map(row => row.instance.data.value),
}))

const resetAll = () => {
  courier.reset()
  cars.reset()
}

/* Pretend the backend accepted the plan: current state becomes the new baseline */
const save = () => {
  const count = requests.value.length
  if (!count) return
  // stop the autoplay without takeOver(): that would reset the edits we're "sending"
  generation++
  auto.value = false
  stepIndex.value = -1
  spot.value = ''
  let maxId = Math.max(0, ...rows.value.map(row => row.instance.data.value.id ?? 0))
  const kept = rows.value
    .filter(row => !row.isRemoved.value)
    .map(row => {
      const car = {...row.instance.data.value}
      if (car.id == null) car.id = ++maxId
      return car
    })
  courier.loadData(JSON.parse(JSON.stringify(data.value)))
  cars.loadData(kept)
  caption.value = `${count} request${count > 1 ? 's' : ''} sent — server state is the new baseline`
}

const escapeHtml = (source: string) =>
  source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const highlight = (value: unknown) =>
  escapeHtml(JSON.stringify(value, null, 2)).replace(
    /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match, str, colon, keyword) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`
      if (keyword) return `<span class="j-bool">${match}</span>`
      return `<span class="j-num">${match}</span>`
    },
  )

/* ============ scripted autoplay ============
 * The page stays calm: one action happens at a time, narrated by a single
 * caption line. Any click into the form stops the script and hands over.
 */

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const auto = ref(!reducedMotion)
const stepIndex = ref(-1)
const caption = ref(auto.value ? 'watch — or click the form to take over' : 'edit anything — the request plan updates live')
const spot = ref('')

let generation = 0
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const typeText = async (apply: (value: string) => void, text: string, gen: number) => {
  for (let i = 1; i <= text.length; i++) {
    if (gen !== generation || !auto.value) return
    apply(text.slice(0, i))
    await sleep(50)
  }
}

interface Step {
  caption: string
  spot: string
  run: (gen: number) => Promise<void>
}

const steps: Step[] = [
  {
    caption: 'edit the courier — a request appears',
    spot: 'name',
    run: gen => typeText(value => (data.value.name = value), 'Marco Alonso', gen),
  },
  {
    caption: 'edit one car — a separate collection in your DB',
    spot: 'car1',
    run: gen => typeText(value => {
      const row = rows.value[1]
      if (row) row.instance.data.value.plate = value
    }, 'B 7777 TR', gen),
  },
  {
    caption: 'revert the courier — its request disappears',
    spot: 'name',
    run: gen => typeText(value => (data.value.name = value), 'Marco Reyes', gen),
  },
  {
    caption: 'add a car — that is a POST, not a form resave',
    spot: 'newcar',
    run: async () => {
      addCar()
    },
  },
  {
    caption: 'one Save button — lit exactly when something changed',
    spot: 'save',
    run: async () => {},
  },
]

const runLoop = async () => {
  const gen = ++generation
  await sleep(1100)
  while (auto.value && gen === generation) {
    for (let i = 0; i < steps.length; i++) {
      if (!auto.value || gen !== generation) return
      stepIndex.value = i
      caption.value = steps[i].caption
      spot.value = steps[i].spot
      await steps[i].run(gen)
      await sleep(1700)
    }
    if (!auto.value || gen !== generation) return
    spot.value = ''
    stepIndex.value = -1
    resetAll()
    caption.value = 'reset() — back to the loaded state'
    await sleep(1800)
  }
}

const takeOver = () => {
  if (!auto.value) return
  generation++
  auto.value = false
  stepIndex.value = -1
  spot.value = ''
  resetAll()
  caption.value = 'your turn — edit anything'
}

const replay = () => {
  resetAll()
  auto.value = true
  runLoop()
}

const onUserTouch = () => takeOver()

if (auto.value) runLoop()

onUnmounted(() => {
  generation++
  auto.value = false
})
</script>

<template>
  <div class="demo-shell">
    <div class="demo-top">
      <span class="demo-dots" aria-hidden="true">
        <i v-for="(step, i) in steps" :key="i" :class="{on: i <= stepIndex}"></i>
      </span>
      <span class="demo-caption">{{ caption }}</span>
      <button v-if="auto" class="demo-top-btn" @click="takeOver"><Icon name="pointer" />try it yourself</button>
      <button v-else class="demo-top-btn" @click="replay"><Icon name="play" />replay</button>
    </div>

    <div class="demo-frame">
      <!-- ============ form side ============ -->
      <div class="demo-form" @pointerdown.capture="onUserTouch">
        <header class="demo-form-head">
          <span class="demo-doc">Courier #17</span>
        </header>

        <div class="field-grid">
          <label class="field" :class="{spot: spot === 'name'}">
            <span class="field-label">Name</span>
            <input v-model="data.name" name="courier-name" type="text" autocomplete="off">
          </label>
          <label class="field">
            <span class="field-label">Phone</span>
            <input v-model="data.phone" name="courier-phone" type="text" autocomplete="off">
          </label>
        </div>

        <p class="demo-note">Cars — a separate collection, saved row by row</p>

        <table class="items">
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="keyOf(row)"
              :class="{
                removed: row.isRemoved.value,
                spot: (spot === 'car1' && index === 1) || (spot === 'newcar' && row.isNew.value),
              }"
            >
              <td>
                <input v-model="row.instance.data.value.model" name="car-model" type="text" autocomplete="off">
                <span v-if="row.isNew.value" class="badge badge-new">new</span>
                <span v-else-if="row.isRemoved.value" class="badge badge-removed">removed</span>
                <span v-else-if="row.instance.isDirty.value" class="badge badge-dirty">modified</span>
              </td>
              <td class="plate">
                <input v-model="row.instance.data.value.plate" name="car-plate" type="text" autocomplete="off">
              </td>
              <td class="row-actions">
                <button
                  v-if="row.isRemoved.value"
                  class="link-btn"
                  title="restore"
                  aria-label="restore"
                  @click="row.isRemoved.value = false"
                ><Icon name="undo" /></button>
                <button
                  v-else
                  class="link-btn"
                  title="remove"
                  aria-label="remove"
                  @click="row.remove()"
                ><Icon name="trash" /></button>
              </td>
            </tr>
          </tbody>
        </table>

        <button class="ghost-btn" @click="addCar"><Icon name="plus" />Add car</button>
      </div>

      <!-- ============ wire side ============ -->
      <div class="demo-wire">
        <header class="wire-head">
          <span class="pill" :class="isDirty ? 'pill-dirty' : 'pill-clean'">
            <i class="dot"></i>{{ isDirty ? 'isDirty: true' : 'isDirty: false' }}
          </span>
          <span class="wire-actions">
            <button class="wire-btn" :disabled="!isDirty" @click="onUserTouch(); resetAll()"><Icon name="undo" />reset()</button>
            <button
              class="save-btn"
              :class="{spot: spot === 'save'}"
              :disabled="!isDirty"
              @click="save"
            ><Icon name="send" />Save{{ requests.length ? ' · ' + requests.length : '' }}</button>
          </span>
        </header>

        <div class="req-list">
          <TransitionGroup name="req">
            <div v-for="request in requests" :key="request.method + request.url" class="req">
              <div class="req-head">
                <span :class="'m-' + request.method">{{ request.method }}</span> {{ request.url }}
              </div>
              <pre v-if="request.body" class="req-body"><code v-html="highlight(request.body)"></code></pre>
            </div>
          </TransitionGroup>
          <p v-if="!requests.length" class="wire-empty">no requests — nothing changed</p>
        </div>

        <p class="wire-stat">
          <template v-if="isDirty">
            {{ requests.length }} request{{ requests.length > 1 ? 's' : '' }} · {{ planBytes }} B<span class="wire-stat-muted"> — resaving the whole tree would be {{ fullBytes.toLocaleString('en-US') }} B</span>
          </template>
          <template v-else>every node clean — the Save button knows</template>
        </p>
      </div>
    </div>
  </div>
</template>
