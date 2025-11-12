<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import { Separator } from "$lib/components/ui/separator";
  import TimerDigital from "$lib/components/custom/Timer-Digital.svelte";

  let open = $state(false);
</script>

<Sidebar.Provider bind:open>
  <AppSidebar />
  <Sidebar.Inset>
    <header class="flex h-16 shrink-0 items-center gap-2">
      <div class="flex items-center gap-2 px-4">
        <Sidebar.Trigger class="-ml-1" />
        <Separator
          orientation="vertical"
          class="mr-2 data-[orientation=vertical]:h-4"
        />
      </div>
      <div class="w-full flex justify-between flex-row-reverse mr-4">
        <div class="w-[20%]">
          <TimerDigital
            duration={30}
            label="work"
            achieved={7}
            onStart={() => console.log("start")}
            onPause={() => console.log("pause")}
            onReset={() => console.log("reset")}
            onComplete={() => console.log("complete")}
            onResume={() => console.log("resume")}
          />
        </div>
      </div>
    </header>
    <div class="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div class="grid auto-rows-min gap-4 md:grid-cols-3">
        <div class="bg-muted/50 aspect-video rounded-xl"></div>
        <div class="bg-muted/50 aspect-video rounded-xl"></div>
        <div class="bg-muted/50 aspect-video rounded-xl"></div>
      </div>
      <div
        class="bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min"
      ></div>
    </div>
  </Sidebar.Inset>
</Sidebar.Provider>
