import { supabase, currentUserId } from "./supabase.js";
import { invalidateEventsCache } from "./eventService.js";

const DEFAULT_CATEGORIES = [
  { name: "Aula",        color: "#3b82f6" },
  { name: "Plantão",     color: "#ef4444" },
  { name: "Ambulatório", color: "#10b981" },
  { name: "Laboratório", color: "#8b5cf6" },
  { name: "Estudo",      color: "#f59e0b" },
  { name: "Prova",       color: "#ec4899" },
  { name: "Congresso",   color: "#06b6d4" },
  { name: "Pessoal",     color: "#6b7280" },
];

// F15.10 — cache de leitura por carregamento: getCategories() é consultado a
// cada resolução de nome de categoria (sessões avulsas, histórico, IA…); a
// promessa é memoizada por usuário e invalidada em toda escrita deste service
// e no logout (categoryView.resetCategories). Mesmo racional do cache de
// getEvents() em eventService.js.
let _categoriesCache = null; // { userId, promise }

export function invalidateCategoriesCache() {
  _categoriesCache = null;
}

export async function getCategories() {
  const user_id = await currentUserId();
  if (_categoriesCache?.userId !== user_id) {
    const entry = { userId: user_id, promise: _fetchCategories(user_id) };
    _categoriesCache = entry;
    // Falha não pode ficar memoizada: a próxima chamada deve reconsultar.
    entry.promise.catch(() => {
      if (_categoriesCache === entry) _categoriesCache = null;
    });
  }
  // Cópia rasa por chamada — nenhum consumidor pode corromper o cache
  // compartilhado ordenando/filtrando o array in place.
  return (await _categoriesCache.promise).slice();
}

async function _fetchCategories(user_id) {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", user_id)
    .order("name");
  if (error) throw error;
  return data;
}

export async function createCategory(name, color) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id, name: name.trim(), color })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Já existe uma categoria com esse nome.");
    throw error;
  }
  invalidateCategoriesCache();
  return data;
}

export async function updateCategory(id, name, color) {
  const user_id = await currentUserId();
  const trimmedName = name.trim();

  const { data: previous } = await supabase
    .from("categories")
    .select("name")
    .eq("id", id)
    .eq("user_id", user_id)
    .single();

  const { data, error } = await supabase
    .from("categories")
    .update({ name: trimmedName, color })
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Já existe uma categoria com esse nome.");
    throw error;
  }
  invalidateCategoriesCache();

  // Mantém os eventos existentes em sincronia: como events.category guarda o
  // nome (não uma FK), um rename precisa ser propagado explicitamente.
  if (previous && previous.name !== trimmedName) {
    const { error: syncError } = await supabase
      .from("events")
      .update({ category: trimmedName })
      .eq("user_id", user_id)
      .eq("category", previous.name);
    if (syncError) throw syncError;
    // O rename escreveu em events.category por fora de eventService — o cache
    // de eventos ficaria com o nome antigo sem esta invalidação.
    invalidateEventsCache();
  }

  return data;
}

export async function deleteCategory(id) {
  const user_id = await currentUserId();

  // Verifica se há eventos usando esta categoria antes de excluir
  const { data: cat } = await supabase
    .from("categories")
    .select("name")
    .eq("id", id)
    .eq("user_id", user_id)
    .single();

  if (cat) {
    const { count } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("category", cat.name);

    if (count > 0) {
      throw new Error(
        `A categoria "${cat.name}" está sendo utilizada em ${count} compromisso(s). Altere os eventos antes de excluí-la.`
      );
    }
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id);
  if (error) throw error;
  invalidateCategoriesCache();
}

// Cria as categorias padrão na primeira vez que o usuário acessa a aplicação.
export async function ensureDefaultCategories() {
  const categories = await getCategories();
  if (categories.length > 0) return categories;

  const user_id = await currentUserId();
  const rows = DEFAULT_CATEGORIES.map(c => ({ ...c, user_id }));
  const { data, error } = await supabase
    .from("categories")
    .insert(rows)
    .select()
    .order("name");
  if (error) throw error;
  // O getCategories() acima memoizou a lista vazia — sem esta invalidação, a
  // próxima leitura devolveria [] mesmo com os padrões recém-criados.
  invalidateCategoriesCache();
  return data;
}
