<script setup lang="ts">
import LiveDemo from './components/LiveDemo.vue'
</script>

<template>
  <nav class="nav">
    <div class="container nav-inner">
      <a class="wordmark" href="/">
        <span class="wordmark-mark"></span>tracked-instance
      </a>
      <div class="nav-links">
        <a href="https://www.npmjs.com/package/tracked-instance" target="_blank" rel="noopener">npm</a>
        <a href="https://github.com/rudnik275/tracked-instance" target="_blank" rel="noopener">GitHub</a>
      </div>
    </div>
  </nav>

  <header class="hero">
    <div class="container">
      <h1 class="hero-title">Send only<br>what changed.</h1>
      <p class="hero-sub">
        A Vue 3 composable for forms built on real collections: edit one row
        in a whole tree of forms — and exactly one request goes out.
        Revert the edit, and none.
      </p>
      <div class="hero-cta">
        <code class="install">$ yarn add tracked-instance</code>
        <span class="hero-meta">zero dependencies · ~2 kB</span>
      </div>
    </div>
  </header>

  <section id="demo" class="demo-section">
    <div class="container">
      <LiveDemo />
    </div>
  </section>

  <section class="tree">
    <div class="container">
      <h2 class="section-title">It scales to a tree of forms</h2>
      <p class="tree-lead">
        A master form, child forms in tabs, a child inside a child — every node tracks
        itself. Dirtiness bubbles up to one Save button; requests go out only from the
        nodes that actually changed.
      </p>
      <div class="tree-figure">
        <pre class="tree-art"><code><span class="t-ink">Movie #7</span> — master form<span class="t-dim">                                        </span><span class="t-save">● Save</span>
├─ title · year · poster
├─ <span class="t-ink">Actors</span> — linked by id, their own DB collection
│  ├─ <span class="t-dirty">Actor #12 — name: "Ada Verne" ●</span>  ───────▶  <span class="t-req">PATCH /actors/12</span>
│  └─ Actor #33 — Tom Hale
└─ <span class="t-ink">Scenes</span> — their own collection
   └─ Scene #3 — a child form in a tab
      └─ Props — a child of a child</code></pre>
      </div>
      <p class="tree-cap">one edited row, any depth → exactly one request · <code>isDirty</code> bubbles to the root</p>
    </div>
  </section>

  <section class="how">
    <div class="container">
      <h2 class="section-title">Three lines of API</h2>
      <div class="steps">
        <div class="step">
          <h3>Wrap your data</h3>
          <pre class="code"><code><span class="c-kw">const</span> invoice = <span class="c-fn">useTrackedInstance</span>({
  customer: { name: <span class="c-str">'Ada'</span> },
})</code></pre>
          <p>Any shape — nested objects, arrays, primitives. No schema.</p>
        </div>
        <div class="step">
          <h3>Mutate freely</h3>
          <pre class="code"><code>invoice.data.value.customer.name = <span class="c-str">'Grace'</span>

invoice.changedData.value
<span class="c-cm">// { customer: { name: 'Grace' } }</span></code></pre>
          <p>Every touched field is recorded. Untouched ones never show up.</p>
        </div>
        <div class="step">
          <h3>Send the diff</h3>
          <pre class="code"><code><span class="c-kw">await</span> api.<span class="c-fn">patch</span>(url,
  invoice.changedData.value)</code></pre>
          <p>Then <code>loadData(fresh)</code> for a new baseline — or <code>reset()</code> to roll back.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="features-list">
        <div class="feature">
          <h3>Deep tracking</h3>
          <p>Objects, arrays, array length — every mutation goes through one stable proxy.</p>
        </div>
        <div class="feature">
          <h3>Revert detection</h3>
          <p>Put the old value back and the field leaves the diff. <code>isDirty</code> follows.</p>
        </div>
        <div class="feature">
          <h3>Collections</h3>
          <p><code>useCollection</code> saves row by row: PATCH the modified item, POST the added one, DELETE the removed.</p>
        </div>
        <div class="feature">
          <h3>Strict TypeScript</h3>
          <p>The diff is a typed <code>DeepPartial</code> of your data. Zero runtime deps.</p>
        </div>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="container footer-inner">
      <span>MIT © Dmytro Rudnyk</span>
      <span class="footer-note">the demo above runs the actual library</span>
      <a href="https://github.com/rudnik275/tracked-instance" target="_blank" rel="noopener">github.com/rudnik275/tracked-instance</a>
    </div>
  </footer>
</template>
