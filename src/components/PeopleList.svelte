<script>
  import { describeRelations } from "../data.js";
  import { store } from "../lib/store.svelte.js";
  import Icon from "./Icon.svelte";

  function initial(name) {
    return [...(name || "?")][0];
  }
</script>

<section class="card">
  <div class="card-head">
    <Icon name="people" />
    <h2>人物一覧</h2>
  </div>
  <div class="people-list">
    {#each store.people as person (person.id)}
      <div class="person-row" class:is-selected={person.id === store.selectedId}>
        <div class="person-avatar">{initial(person.name)}</div>
        <div class="person-text">
          <div class="person-title">{person.name || `#${person.id}`}</div>
          <div class="person-meta">{describeRelations(person, store.people)}</div>
        </div>
        <button type="button" class="secondary" aria-label={`${person.name || person.id}を編集`} onclick={() => store.selectPerson(person.id)}>
          <Icon name="edit" size={16} />編集
        </button>
      </div>
    {/each}
  </div>
</section>
