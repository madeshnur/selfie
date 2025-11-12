<script lang="ts">
  import { onMount } from "svelte";
  import Database from "$lib/db";
  import {
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
  } from "$env/static/public";

  const db = Database.getInstance();
  onMount(async () => {
    await db.initialize(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
    await db.startAutoSync(5);
  });
</script>
