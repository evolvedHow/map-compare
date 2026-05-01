<script lang="ts">
  import type { ShapefileEntry } from '../types';
  import { shapefiles } from '../stores/shapefileStore';

  interface Props {
    entry: ShapefileEntry;
    onViewMap?: (entry: ShapefileEntry) => void;
  }

  let { entry, onViewMap }: Props = $props();

  let editing = $state(false);
  let editName = $state(entry.metadata.name);
  let editProvenance = $state(entry.metadata.provenance);
  let editUploadedBy = $state(entry.metadata.uploadedBy);
  let editComments = $state(entry.metadata.comments);
  let editTagInput = $state('');
  let editTags = $state([...entry.metadata.tags]);

  function addTag() {
    const t = editTagInput.trim();
    if (t && !editTags.includes(t)) {
      editTags = [...editTags, t];
    }
    editTagInput = '';
  }

  function removeTag(tag: string) {
    editTags = editTags.filter(t => t !== tag);
  }

  async function saveEdit() {
    await shapefiles.updateMeta(entry.metadata.id, {
      name: editName,
      provenance: editProvenance,
      uploadedBy: editUploadedBy,
      comments: editComments,
      tags: editTags
    });
    editing = false;
  }

  function cancelEdit() {
    editName = entry.metadata.name;
    editProvenance = entry.metadata.provenance;
    editUploadedBy = entry.metadata.uploadedBy;
    editComments = entry.metadata.comments;
    editTags = [...entry.metadata.tags];
    editing = false;
  }

  async function handleDelete() {
    if (confirm(`Delete "${entry.metadata.name}"? This cannot be undone.`)) {
      await shapefiles.remove(entry.metadata.id);
    }
  }

  const chamberColors: Record<string, string> = {
    senate: 'bg-purple-100 text-purple-700',
    house: 'bg-green-100 text-green-700',
    congress: 'bg-blue-100 text-blue-700',
    custom: 'bg-gray-100 text-gray-700'
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
</script>

<div class="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-3 border border-gray-100">
  {#if editing}
    <!-- Edit form -->
    <div class="space-y-3">
      <div>
        <label for="edit-name" class="text-xs font-medium text-gray-500">Name</label>
        <input
          id="edit-name"
          bind:value={editName}
          class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label for="edit-provenance" class="text-xs font-medium text-gray-500">Provenance</label>
        <input
          id="edit-provenance"
          bind:value={editProvenance}
          class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label for="edit-uploaded-by" class="text-xs font-medium text-gray-500">Uploaded by</label>
        <input
          id="edit-uploaded-by"
          bind:value={editUploadedBy}
          class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label for="edit-comments" class="text-xs font-medium text-gray-500">Comments</label>
        <textarea
          id="edit-comments"
          bind:value={editComments}
          rows="2"
          class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        ></textarea>
      </div>
      <div>
        <label for="edit-tag-input" class="text-xs font-medium text-gray-500">Tags</label>
        <div class="flex flex-wrap gap-1 mt-1 mb-1">
          {#each editTags as tag}
            <span class="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              {tag}
              <button onclick={() => removeTag(tag)} class="hover:text-red-500 leading-none">&times;</button>
            </span>
          {/each}
        </div>
        <div class="flex gap-2">
          <input
            id="edit-tag-input"
            bind:value={editTagInput}
            onkeydown={(e) => e.key === 'Enter' && addTag()}
            placeholder="Add tag…"
            class="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onclick={addTag} class="px-3 py-1.5 bg-gray-100 rounded-lg text-xs hover:bg-gray-200">Add</button>
        </div>
      </div>
      <div class="flex gap-2 pt-1">
        <button onclick={saveEdit} class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
        <button onclick={cancelEdit} class="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  {:else}
    <!-- Display mode -->
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="font-semibold text-base truncate">{entry.metadata.name}</h3>
        <p class="text-xs text-gray-500 mt-0.5">
          State FIPS {entry.metadata.stateFips} &middot;
          {entry.metadata.districtCount} districts &middot;
          {entry.metadata.year}
        </p>
      </div>
      <span class="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full {chamberColors[entry.metadata.chamber]}">
        {entry.metadata.chamber}
      </span>
    </div>

    {#if entry.metadata.tags.length > 0}
      <div class="flex flex-wrap gap-1">
        {#each entry.metadata.tags as tag}
          <span class="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{tag}</span>
        {/each}
      </div>
    {/if}

    <div class="text-xs text-gray-500 space-y-0.5">
      {#if entry.metadata.provenance}
        <p><span class="font-medium text-gray-600">Source:</span> {entry.metadata.provenance}</p>
      {/if}
      {#if entry.metadata.uploadedBy}
        <p><span class="font-medium text-gray-600">By:</span> {entry.metadata.uploadedBy}</p>
      {/if}
      {#if entry.metadata.comments}
        <p class="italic text-gray-400">{entry.metadata.comments}</p>
      {/if}
      <p class="text-gray-400">Added {fmt(entry.metadata.createdAt)}</p>
    </div>

    {#if entry.metadata.warnings.length > 0}
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
        {#each entry.metadata.warnings as w}
          <p>⚠ {w}</p>
        {/each}
      </div>
    {/if}

    <div class="flex gap-2 pt-1">
      {#if onViewMap}
        <button
          onclick={() => onViewMap!(entry)}
          class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          View on Map
        </button>
      {/if}
      <button
        onclick={() => (editing = true)}
        class="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
      >
        Edit
      </button>
      <button
        onclick={handleDelete}
        class="py-2 px-3 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 transition-colors"
      >
        Delete
      </button>
    </div>
  {/if}
</div>
