<script lang="ts">
  import { onMount } from "svelte";
  import Progress from "../ui/progress/progress.svelte";
  import * as DropdownMenu from "../ui/dropdown-menu";
  import Timer from "$lib/components/custom/Timer.svelte";
  import { BriefcaseBusiness, Smile, Drama, Trash } from "@lucide/svelte";

  let mode = $state<"work" | "break" | "long-break">("work");
  const modeOptions = [
    { value: "work", label: "Work" },
    { value: "break", label: "Break" },
    { value: "long-break", label: "Long Break" },
  ];

  let timeLeft = $state<number>(1 * 60); // in seconds
  let running = $state<boolean>(false);
  let autoStart = $state<boolean>(false);
  let interval: number | null = null;
  let minutes = $state<string>("25");
  let seconds = $state<string>("00");
  let progress = $state<number>(100);

  let completedSessions = $state(0);
  let targetSessions = $state(8);
  let shortBreaksTaken = $state(0);
  let goalProgress = $state<number>(0);

  const modeNext = $derived(
    mode === "work" ? (shortBreaksTaken >= 2 ? "long-break" : "break") : "work"
  );
  const durations = {
    work: 1 * 60,
    break: 0.25 * 60,
    "long-break": 0.5 * 60,
  };

  onMount(() => {
    // 🔁 Restore from localStorage
    const saved = localStorage.getItem("pomodoro-progress");
    if (saved) {
      const data = JSON.parse(saved);
      completedSessions = data.completedSessions ?? 0;
      targetSessions = data.targetSessions ?? 8;
      shortBreaksTaken = data.shortBreaksTaken ?? 0;
    }
  });

  const persistProgress = () => {
    localStorage.setItem(
      "pomodoro-progress",
      JSON.stringify({
        completedSessions,
        targetSessions,
        shortBreaksTaken,
      })
    );
  };

  const switchMode = (newMode: "work" | "break" | "long-break") => {
    mode = newMode;
    timeLeft = durations[newMode];
    stop();
  };

  const start = () => {
    if (running) return;
    running = true;
    interval = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
      } else {
        stop();
        handleModeCompletion();
      }
    }, 1000);
  };
  const stop = () => {
    running = false;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };
  const reset = () => {
    stop();
    timeLeft = durations[mode];
  };
  const resetProgress = () => {
    completedSessions = 0;
    shortBreaksTaken;
    persistProgress();
  };
  const playSound = () => {
    const audio = new Audio("/sounds/ring.mp3");
    audio.play();
  };
  const handleModeCompletion = () => {
    playSound();
    if (mode === "work") {
      completedSessions++;
      shortBreaksTaken++;
      persistProgress();

      if (shortBreaksTaken >= 2) {
        shortBreaksTaken = 0;
        persistProgress();
        switchMode("long-break");
      } else {
        switchMode("break");
      }
    } else {
      switchMode("work");
    }
    if (autoStart) {
      start();
    }
  };
  $effect(() => {
    minutes = Math.floor(timeLeft / 60)
      .toString()
      .padStart(2, "0");
    seconds = (timeLeft % 60).toString().padStart(2, "0");
    progress = (timeLeft / durations[mode]) * 100;
    goalProgress = Math.min((completedSessions / targetSessions) * 100, 100);
  });
</script>

<div class="flex flex-col items-center">
  <Timer
    bind:minutes
    bind:seconds
    bind:running
    bind:progress
    onPause={stop}
    onStart={start}
    onReset={reset}
  />
  <div class="flex gap-4 mt-2 items-center">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#if mode === "work"}
          <BriefcaseBusiness />
        {:else if mode === "break"}
          <Smile />
        {:else}
          <Drama />
        {/if}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {#each modeOptions as option}
          <DropdownMenu.Item onSelect={() => switchMode(option.value)}>
            {#if option.value === "work"}
              <BriefcaseBusiness class="inline mr-2" />
            {:else if option.value === "break"}
              <Smile class="inline mr-2" />
            {:else}
              <Drama class="inline mr-2" />
            {/if}
            {option.label}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <di>></di>
    <div class="text-slate-400">
      {#if modeNext === "work"}
        <BriefcaseBusiness />
      {:else if modeNext === "break"}
        <Smile />
      {:else}
        <Drama />
      {/if}
    </div>
  </div>
  <div class="w-40 mt-2">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="w-full">
        <Progress value={completedSessions} max={targetSessions} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item onSelect={resetProgress}>
          <Trash />
          Reset Progress
        </DropdownMenu.Item>
        <DropdownMenu.CheckboxItem bind:checked={autoStart}>
          Auto Start Next
        </DropdownMenu.CheckboxItem>
        <DropdownMenu.Separator />
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger>
            <BriefcaseBusiness />
            Set Target Sessions: {targetSessions}
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            {#each [4, 6, 8, 10, 12] as target}
              <DropdownMenu.Item onSelect={() => (targetSessions = target)}>
                {target} Sessions
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>
