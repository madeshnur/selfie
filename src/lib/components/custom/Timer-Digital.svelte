<script lang="ts">
  import {
    BriefcaseBusiness,
    Smile,
    Ellipsis,
    TimerReset,
  } from "@lucide/svelte";
  import * as DropdownMenu from "../ui/dropdown-menu";
  import { Progress } from "$lib/components/ui/progress";

  interface Props {
    duration: number; // in seconds
    label?: "work" | "break" | "long-break";
    onStart?: () => void;
    onComplete?: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onReset?: () => void;
    autoStart?: boolean;
    target?: number;
    achieved?: number;
  }

  let {
    duration = 60 * 25,
    label = "work",
    onStart,
    onComplete,
    onPause,
    onReset,
    onResume,
    autoStart = true,
    target = 8,
    achieved,
  }: Props = $props();

  let isStarted = $state(false);
  let timeRemaining = $state(duration);
  let isRunning = $state(false);
  let isPaused = $state(false);

  // Derived values
  let progress = $derived(((duration - timeRemaining) / duration) * 100);
  let reversedProgress = $derived(100 - progress);
  let textColor = $derived(
    reversedProgress < 60 ? "text-gray-800" : "text-white"
  );

  let textColorIcon = $derived(
    reversedProgress < 10 ? "text-gray-800" : "text-white"
  );
  let textColorSettings = $derived(
    reversedProgress < 85 ? "text-gray-800" : "text-white"
  );
  let minutes = $derived(Math.floor(timeRemaining / 60));
  let seconds = $derived(timeRemaining % 60);
  let displayTime = $derived(
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  );

  // Timer effect
  $effect(() => {
    if (!isRunning || isPaused) return;

    const interval = setInterval(() => {
      if (timeRemaining > 0) {
        timeRemaining -= 1;
      } else {
        isRunning = false;
        isStarted = false;
        onComplete?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  });

  function toggleTimer() {
    if (!isRunning) {
      isRunning = true;
      isPaused = false;
    } else {
      isPaused = !isPaused;
    }
    if (isPaused) {
      onPause?.();
    } else if (isStarted) {
      onResume?.();
    }
    if (!isStarted) {
      isStarted = true;
      onStart?.();
    }
  }

  function stopTimer() {
    isRunning = false;
    isPaused = false;
    timeRemaining = duration;
    onReset?.();
  }
</script>

<div class="w-full flex flex-col items-center">
  <!-- Timer Display with Progress Background -->

  <button
    onclick={toggleTimer}
    class="relative w-full h-10 rounded-md overflow-hidden border-2 border-gray-200
           hover:border-gray-300 transition-colors cursor-pointer group"
  >
    <!-- Progress Background -->
    <div
      class="absolute inset-0 bg-slate-500
             transition-all duration-1000 ease-linear"
      style="width: {reversedProgress}%"
    ></div>

    <!-- Overlay for better text visibility -->
    <div class="absolute inset-0 bg-black/10"></div>

    <!-- Digital Clock Display -->
    <div class="relative h-full flex items-center justify-center">
      <span
        class={`font-mono text-3xl font-bold ${textColor}
                   transition-colors`}
      >
        {displayTime}
      </span>
    </div>

    <div class={`absolute top-2.5 left-2  ${textColorIcon}`}>
      {#if label === "work"}
        <BriefcaseBusiness size="18" />
      {:else}
        <Smile size="18" />
      {/if}
    </div>
    <!-- Status Indicator -->
    <div class="absolute top-2 right-2">
      {#if isRunning && !isPaused}
        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
      {:else if isPaused}
        <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
      {/if}
    </div>

    <div class={`absolute top-3.5 right-2 ${textColorSettings} z-50`}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Ellipsis size="18" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onSelect={stopTimer}>
            <TimerReset />
            Reset
          </DropdownMenu.Item>
          <DropdownMenu.CheckboxItem bind:checked={autoStart}>
            Auto Start
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  </button>
  <Progress class="h-1 mt-0.5 w-[90%]" max={target} value={achieved} />
</div>
