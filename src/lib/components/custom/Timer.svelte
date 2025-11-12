<script lang="ts">
  import { Play, Pause, RefreshCcw } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import { Button } from "$lib/components/ui/button";
  let {
    minutes = $bindable(0),
    seconds = $bindable(0),
    progress = $bindable(0),
    size = "size-40",
    circleBgClass = "text-muted",
    circleFgClass = "text-primary",
    fontClass = "text-4xl",
    running = $bindable(false),
    onStart,
    onPause,
    onReset,
  } = $props<{
    minutes?: string;
    seconds?: string;
    progress?: number;
    size?: string;
    circleBgClass?: string;
    circleFgClass?: string;
    fontClass?: string;
    running?: boolean;
    onStart?: () => void;
    onPause?: () => void;
    onReset?: () => void;
  }>();
</script>

<div
  class={cn(
    "relative flex items-center justify-center",
    size,
    "border border-white"
  )}
>
  <svg class="absolute top-0 left-0" viewBox="0 0 100 100">
    <circle
      class={cn(circleBgClass)}
      stroke="currentColor"
      stroke-width="8"
      fill="transparent"
      r="45"
      cx="50"
      cy="50"
    />
    <circle
      class={cn(circleFgClass)}
      stroke="currentColor"
      stroke-width="8"
      fill="transparent"
      r="45"
      cx="50"
      cy="50"
      stroke-dasharray="282"
      stroke-dashoffset={282 - (progress / 100) * 282}
      stroke-linecap="round"
    />
  </svg>
  <div class="flex z-10 flex-col items-center justify-center">
    <Button
      variant="ghost"
      size="icon-sm"
      class="p-0 mb-2"
      disabled={!onStart && !onPause}
      onclick={() => {
        if (running) {
          onPause?.();
        } else {
          onStart?.();
        }
      }}
    >
      {#if onPause || onStart}
        {#if running}
          <Pause />
        {:else}
          <Play />
        {/if}
      {/if}
    </Button>

    <div class={cn("font-mono", fontClass)}>{minutes}:{seconds}</div>

    <Button
      variant="ghost"
      size="icon-sm"
      class="p-0 mb-2"
      disabled={!onReset}
      onclick={() => {
        onReset?.();
      }}
    >
      {#if onReset}
        <RefreshCcw />
      {/if}
    </Button>
  </div>
</div>

<style>
  circle {
    transition: stroke-dashoffset 0.5s ease;
  }
</style>
