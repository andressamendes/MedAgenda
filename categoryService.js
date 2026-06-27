import { supabase } from "./supabase.js";

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

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error("Usuário não autenticado.");
  return id;
}

export async function getCategories() {
  const user_id = await currentUserId();
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
  return data;
}

export async function updateCategory(id, name, color) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("categories")
    .update({ name: name.trim(), color })
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Já existe uma categoria com esse nome.");
    throw error;
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
  return data;
}
