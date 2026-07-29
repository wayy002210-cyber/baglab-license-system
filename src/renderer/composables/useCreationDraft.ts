import { ref } from "vue";
import type { CreationDraft } from "../../shared/contracts";

export function createEmptyDraft(): CreationDraft {
  return {
    version: 1,
    stage: "persona",
    personaId: null,
    copywriting: null,
    voice: null,
    audioSegments: [],
    shots: [],
    bgm: null,
    titleStyle: null,
    subtitleStyle: null
  };
}

export function useCreationDraft() {
  const draft = ref<CreationDraft>(createEmptyDraft());
  const loading = ref(false);
  const saving = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function load(): Promise<CreationDraft> {
    loading.value = true;
    try {
      draft.value =
        (await window.autocut.getCreationDraft()) ?? createEmptyDraft();
      return draft.value;
    } finally {
      loading.value = false;
    }
  }

  async function saveImmediate(): Promise<CreationDraft> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    saving.value = true;
    try {
      draft.value = await window.autocut.saveCreationDraft(draft.value);
      return draft.value;
    } finally {
      saving.value = false;
    }
  }

  function scheduleSave(delay = 500): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void saveImmediate();
    }, delay);
  }

  return { draft, loading, saving, load, saveImmediate, scheduleSave };
}
