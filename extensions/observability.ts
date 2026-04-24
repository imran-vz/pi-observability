/**
 * Agent Observability Extension
 *
 * Replaces the default footer with a live observability bar showing:
 * - Session input/output tokens & cost
 * - Live TPS during streaming (chunk-based estimate)
 * - Session runtime
 * - Current model, thinking level, fast mode & git branch
 * - Git diff stats (added/removed lines)
 * - Context usage (current/max)
 *
 * It also prints the legacy TPS summary notification at the end of each
 * agent run, so the standalone TPS extension is no longer needed.
 *
 * Commands:
 *   /obs          - Print full observability dashboard + last 10 sessions
 *   /obs-toggle   - Toggle the observability footer on/off
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
	Theme as PiTheme,
	ThemeColor,
} from "@mariozechner/pi-coding-agent";
import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";

/* ───── Types ───── */

interface TurnRecord {
	turnIndex: number;
	inputTokens: number;
	outputTokens: number;
	cost: number;
	durationMs: number;
	tps: number;
	model: string;
}

interface PersistedTurn {
	customType: "obs-turn";
	data: TurnRecord;
}

interface SessionState {
	startTime: number;
	turns: TurnRecord[];
	currentTurnStartTime: number | null;
	currentTurnUpdateCount: number;
	agentStartTime: number | null;
	isStreaming: boolean;
	footerEnabled: boolean;
	fastModeSupported: boolean;
	fastModeEnabled: boolean;
	serviceTier: string | null;
	showFullPath: boolean;
}

interface SessionSummary {
	endedAt: number;
	runtimeMs: number;
	turns: number;
	inputTokens: number;
	outputTokens: number;
	cost: number;
	model: string;
	cwd: string;
	branch: string | null;
}

/* ───── Helpers ───── */

function fmtDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) ms = 0;
	const s = Math.floor(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0)
		return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
	return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return `${n}`;
}

function shortenPath(p: string): string {
	const home = homedir();
	if (home && p.startsWith(home)) return p.replace(home, "~");
	return p;
}

function thinkingColor(level: string): ThemeColor {
	switch (level) {
		case "off":
			return "thinkingOff";
		case "minimal":
			return "thinkingMinimal";
		case "low":
			return "thinkingLow";
		case "medium":
			return "thinkingMedium";
		case "high":
			return "thinkingHigh";
		case "xhigh":
			return "thinkingXhigh";
		default:
			return "thinkingOff";
	}
}

function rainbowText(text: string): string {
	const colors = [
		"\x1b[38;2;255;0;0m",     // red
		"\x1b[38;2;255;127;0m",   // orange
		"\x1b[38;2;255;255;0m",   // yellow
		"\x1b[38;2;0;255;0m",     // green
		"\x1b[38;2;0;255;255m",   // cyan
		"\x1b[38;2;0;0;255m",     // blue
		"\x1b[38;2;255;0;255m",   // magenta
	];
	let result = "";
	for (let i = 0; i < text.length; i++) {
		result += colors[i % colors.length] + text[i];
	}
	result += "\x1b[0m";
	return result;
}

function formatModelThink(model: string, level: string, theme: PiTheme): string {
	const text = `${model}:${level}`;
	if (level === "xhigh" || level === "max") {
		return rainbowText(text);
	}
	return theme.fg(thinkingColor(level), text);
}

function scanHistoricalTurns(ctx: ExtensionContext): TurnRecord[] {
	const turns: TurnRecord[] = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === "obs-turn") {
			turns.push((entry as unknown as PersistedTurn).data);
		}
	}
	return turns;
}

function getSessionStartTime(ctx: ExtensionContext): number {
	const entries = ctx.sessionManager.getBranch();
	for (const e of entries) {
		if (typeof e.timestamp === "number" && Number.isFinite(e.timestamp)) {
			return e.timestamp;
		}
	}
	return Date.now();
}

function alignCell(
	str: string,
	width: number,
	align: "left" | "right" = "left",
): string {
	const vis = visibleWidth(str);
	if (vis > width) return truncateToWidth(str, width);
	const pad = width - vis;
	return align === "right" ? " ".repeat(pad) + str : str + " ".repeat(pad);
}

function getStringProp(value: unknown, key: string): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	const prop = (value as Record<string, unknown>)[key];
	return typeof prop === "string" ? prop : undefined;
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
	return (
		!!message &&
		typeof message === "object" &&
		(message as { role?: unknown }).role === "assistant"
	);
}

function getServiceTierFromPayload(payload: unknown): string | null {
	const tier =
		getStringProp(payload, "service_tier") ??
		getStringProp(payload, "serviceTier");
	return tier?.trim() || null;
}

function supportsFastMode(ctx: ExtensionContext): boolean {
	const model = ctx.model;
	if (!model) return false;
	if (model.api !== "openai-codex-responses") return false;
	return (
		model.provider === "openai-codex" ||
		model.provider === "openai" ||
		model.id.toLowerCase().includes("gpt-5.5")
	);
}

/* ───── History persistence ───── */

const HISTORY_DIR = join(homedir(), ".pi", "agent", "observability");
const HISTORY_FILE = join(HISTORY_DIR, "history.jsonl");

async function loadHistory(): Promise<SessionSummary[]> {
	try {
		const text = await readFile(HISTORY_FILE, "utf8");
		const lines = text.split("\n").filter((l) => l.trim());
		return lines.map((l) => JSON.parse(l));
	} catch {
		return [];
	}
}

async function saveHistory(sessions: SessionSummary[]): Promise<void> {
	await mkdir(HISTORY_DIR, { recursive: true });
	const text = `${sessions.map((s) => JSON.stringify(s)).join("\n")}\n`;
	await writeFile(HISTORY_FILE, text, "utf8");
}

/* ───── Dashboard formatting ───── */

type DashboardTheme = Pick<PiTheme, "fg" | "bold">;

function buildDashboard(
	state: SessionState,
	ctx: ExtensionContext,
	branch: string | null,
	history: SessionSummary[],
	termWidth: number,
	theme: DashboardTheme,
): string[] {
	const runtime = Date.now() - state.startTime;
	const totalIn = state.turns.reduce((s, t) => s + t.inputTokens, 0);
	const totalOut = state.turns.reduce((s, t) => s + t.outputTokens, 0);
	const totalCost = state.turns.reduce((s, t) => s + t.cost, 0);

	const B = (s: string) => theme.fg("border", s);
	const lines: string[] = [];

	// ── Summary Card ──
	const summaryLines = [
		theme.bold("Agent Observability Dashboard"),
		`Runtime: ${fmtDuration(runtime)}    Dir: ${shortenPath(ctx.cwd)}`,
		branch
			? `Branch: ${branch}    Model: ${ctx.model?.id ?? "none"}`
			: `Model: ${ctx.model?.id ?? "none"}`,
		`Tokens: ↑${fmtTokens(totalIn)} ↓${fmtTokens(totalOut)}`,
		`Cost: $${totalCost.toFixed(6)}`,
	];
	const summaryW = Math.min(
		Math.max(...summaryLines.map((c) => visibleWidth(c))) + 4,
		termWidth,
	);
	const inner = summaryW - 4;
	const padSummary = (text: string) => {
		const safe = truncateToWidth(text, inner);
		const vis = visibleWidth(safe);
		const pad = Math.max(0, inner - vis);
		return B("│ ") + safe + B(`${" ".repeat(pad)} │`);
	};

	lines.push(B(`┌${"─".repeat(summaryW - 2)}┐`));
	lines.push(padSummary(summaryLines[0]));
	lines.push(B(`├${"─".repeat(summaryW - 2)}┤`));
	for (let i = 1; i < summaryLines.length; i++) {
		lines.push(padSummary(summaryLines[i]));
	}
	lines.push(B(`└${"─".repeat(summaryW - 2)}┘`));

	// ── Turns Table ──
	if (state.turns.length > 0) {
		lines.push("");
		lines.push(
			`  ${theme.bold(theme.fg("accent", `TURNS  (${state.turns.length})`))}`,
		);

		const headers = ["#", "Input", "Output", "Time", "TPS", "Cost", "Model"];
		const rows = state.turns.map((t, i) => [
			`${i + 1}`,
			`↑${fmtTokens(t.inputTokens)}`,
			`↓${fmtTokens(t.outputTokens)}`,
			fmtDuration(t.durationMs),
			`${t.tps.toFixed(1)}`,
			`$${t.cost.toFixed(2)}`,
			t.model,
		]);

		const colW = headers.map((h, i) =>
			Math.max(visibleWidth(h), ...rows.map((r) => visibleWidth(r[i]))),
		);
		const tableW = colW.reduce((a, b) => a + b, 0) + 2 * (colW.length - 1) + 2;
		if (tableW > termWidth && colW[colW.length - 1]! > 10) {
			colW[colW.length - 1] = Math.max(
				10,
				colW[colW.length - 1]! - (tableW - termWidth),
			);
		}

		const pad = "  ";
		const hdr = `  ${headers.map((h, i) => alignCell(h, colW[i]!)).join(pad)}`;
		lines.push(theme.fg("dim", hdr));
		lines.push(B(`  ${"─".repeat(visibleWidth(hdr) - 2)}`));
		for (const row of rows) {
			const cells = row.map((c, i) =>
				alignCell(c, colW[i]!, i === 0 || i >= 3 ? "left" : "right"),
			);
			lines.push(`  ${cells.join(pad)}`);
		}
	}

	// ── History Table ──
	if (history.length > 0) {
		lines.push("");
		lines.push(`  ${theme.bold(theme.fg("accent", "LAST 10 SESSIONS"))}`);

		const headers = [
			"When",
			"Duration",
			"Turns",
			"Input",
			"Output",
			"Cost",
			"Model",
		];
		const rows = history
			.slice()
			.reverse()
			.map((h) => {
				const date = new Date(h.endedAt).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				return [
					date,
					fmtDuration(h.runtimeMs),
					`${h.turns}`,
					`↑${fmtTokens(h.inputTokens)}`,
					`↓${fmtTokens(h.outputTokens)}`,
					`$${h.cost.toFixed(2)}`,
					h.model,
				];
			});

		const colW = headers.map((h, i) =>
			Math.max(visibleWidth(h), ...rows.map((r) => visibleWidth(r[i]))),
		);
		const tableW = colW.reduce((a, b) => a + b, 0) + 2 * (colW.length - 1) + 2;
		if (tableW > termWidth && colW[colW.length - 1]! > 10) {
			colW[colW.length - 1] = Math.max(
				10,
				colW[colW.length - 1]! - (tableW - termWidth),
			);
		}

		const pad = "  ";
		const hdr = `  ${headers.map((h, i) => alignCell(h, colW[i]!)).join(pad)}`;
		lines.push(theme.fg("dim", hdr));
		lines.push(B(`  ${"─".repeat(visibleWidth(hdr) - 2)}`));
		for (const row of rows) {
			const cells = row.map((c, i) =>
				alignCell(c, colW[i]!, i === 0 || i >= 2 ? "left" : "right"),
			);
			lines.push(`  ${cells.join(pad)}`);
		}
	}

	return lines;
}

/* ───── Extension ───── */

export default function (pi: ExtensionAPI) {
	const state: SessionState = {
		startTime: Date.now(),
		turns: [],
		currentTurnStartTime: null,
		currentTurnUpdateCount: 0,
		agentStartTime: null,
		isStreaming: false,
		footerEnabled: true,
		fastModeSupported: false,
		fastModeEnabled: false,
		serviceTier: null,
		showFullPath: false,
	};

	/* ─── Lifecycle ─── */

	pi.on("session_start", async (_event, ctx) => {
		state.startTime = getSessionStartTime(ctx);
		state.turns = scanHistoricalTurns(ctx);
		state.currentTurnStartTime = null;
		state.currentTurnUpdateCount = 0;
		state.agentStartTime = null;
		state.isStreaming = false;
		state.fastModeSupported = supportsFastMode(ctx);
		state.fastModeEnabled = false;
		state.serviceTier = null;

		if (state.footerEnabled && ctx.hasUI) {
			setupFooter(ctx);
		}
	});

	pi.on("agent_start", async () => {
		state.agentStartTime = Date.now();
	});

	pi.on("turn_start", async (_event, _ctx) => {
		state.currentTurnStartTime = Date.now();
		state.currentTurnUpdateCount = 0;
		state.isStreaming = true;
	});

	pi.on("model_select", async (_event, ctx) => {
		state.fastModeSupported = supportsFastMode(ctx);
		state.fastModeEnabled = false;
		state.serviceTier = null;
	});

	pi.on("before_provider_request", async (event, ctx) => {
		state.serviceTier = getServiceTierFromPayload(event.payload)?.toLowerCase() ?? null;
		state.fastModeEnabled = state.serviceTier === "fast";
		state.fastModeSupported = supportsFastMode(ctx) || state.fastModeEnabled;
	});

	pi.on("message_update", async (_event, _ctx) => {
		state.currentTurnUpdateCount++;
	});

	pi.on("turn_end", async (event, ctx) => {
		const duration = state.currentTurnStartTime
			? Date.now() - state.currentTurnStartTime
			: 0;

		let inputTokens = 0;
		let outputTokens = 0;
		let cost = 0;

		const branch = ctx.sessionManager.getBranch();
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type === "message" && entry.message.role === "assistant") {
				const m = entry.message as AssistantMessage;
				inputTokens = m.usage?.input ?? 0;
				outputTokens = m.usage?.output ?? 0;
				cost = m.usage?.cost?.total ?? 0;
				break;
			}
		}

		const tps =
			duration > 0 && outputTokens >= 0 ? outputTokens / (duration / 1000) : 0;

		const record: TurnRecord = {
			turnIndex: event.turnIndex,
			inputTokens,
			outputTokens,
			cost,
			durationMs: duration,
			tps,
			model: ctx.model?.id ?? "unknown",
		};

		state.turns.push(record);
		state.isStreaming = false;
		state.currentTurnStartTime = null;
		state.currentTurnUpdateCount = 0;

		pi.appendEntry("obs-turn", record);
	});

	pi.on("agent_end", async (event, ctx) => {
		state.isStreaming = false;

		if (!ctx.hasUI || state.agentStartTime === null) {
			state.agentStartTime = null;
			return;
		}

		const elapsedMs = Date.now() - state.agentStartTime;
		state.agentStartTime = null;
		if (elapsedMs <= 0) return;

		let input = 0;
		let output = 0;
		let cacheRead = 0;
		let cacheWrite = 0;
		let totalTokens = 0;

		for (const message of event.messages) {
			if (!isAssistantMessage(message)) continue;
			input += message.usage?.input ?? 0;
			output += message.usage?.output ?? 0;
			cacheRead += message.usage?.cacheRead ?? 0;
			cacheWrite += message.usage?.cacheWrite ?? 0;
			totalTokens += message.usage?.totalTokens ?? 0;
		}

		if (output <= 0) return;

		const elapsedSeconds = elapsedMs / 1000;
		const tokensPerSecond = output / elapsedSeconds;
		ctx.ui.notify(
			`TPS ${tokensPerSecond.toFixed(1)} tok/s. out ${output.toLocaleString()}, in ${input.toLocaleString()}, cache r/w ${cacheRead.toLocaleString()}/${cacheWrite.toLocaleString()}, total ${totalTokens.toLocaleString()}, ${elapsedSeconds.toFixed(1)}s`,
			"info",
		);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		const totalIn = state.turns.reduce((s, t) => s + t.inputTokens, 0);
		const totalOut = state.turns.reduce((s, t) => s + t.outputTokens, 0);
		const totalCost = state.turns.reduce((s, t) => s + t.cost, 0);
		const runtime = Date.now() - state.startTime;

		let branch: string | null = null;
		try {
			const result = await pi.exec("git", ["branch", "--show-current"], {
				cwd: ctx.cwd,
			});
			branch = result.stdout?.trim() || null;
		} catch {
			branch = null;
		}

		const summary: SessionSummary = {
			endedAt: Date.now(),
			runtimeMs: runtime,
			turns: state.turns.length,
			inputTokens: totalIn,
			outputTokens: totalOut,
			cost: totalCost,
			model: ctx.model?.id ?? "unknown",
			cwd: ctx.cwd,
			branch,
		};

		const history = await loadHistory();
		history.push(summary);
		if (history.length > 10) history.splice(0, history.length - 10);
		await saveHistory(history);
	});

	/* ─── Footer ─── */

	function setupFooter(ctx: ExtensionContext) {
		ctx.ui.setFooter((tui, theme, footerData) => {
			let diffAdded = 0;
			let diffRemoved = 0;

			async function refreshDiff() {
				try {
					const result = await pi.exec("git", ["diff", "--numstat"], {
						cwd: ctx.cwd,
					});
					if (result.code === 0 && result.stdout) {
						let added = 0;
						let removed = 0;
						for (const line of result.stdout.split("\n")) {
							const parts = line.trim().split(/\s+/);
							if (parts.length >= 2) {
								const a = parseInt(parts[0], 10);
								const b = parseInt(parts[1], 10);
								if (!Number.isNaN(a)) added += a;
								if (!Number.isNaN(b)) removed += b;
							}
						}
						diffAdded = added;
						diffRemoved = removed;
						return;
					}
				} catch {
					/* ignore */
				}
				diffAdded = 0;
				diffRemoved = 0;
			}

			refreshDiff();

			const unsubBranch = footerData.onBranchChange(() => {
				refreshDiff();
				tui.requestRender();
			});

			const timer = setInterval(() => {
				refreshDiff();
				tui.requestRender();
			}, 1000);

			return {
				dispose() {
					unsubBranch();
					clearInterval(timer);
				},
				invalidate() {},
				render(width: number): string[] {
					let totalIn = 0;
					let totalOut = 0;
					let totalCost = 0;
					for (const t of state.turns) {
						totalIn += t.inputTokens;
						totalOut += t.outputTokens;
						totalCost += t.cost;
					}
					const runtime = Date.now() - state.startTime;

					const branch = footerData.getGitBranch();
					const model = ctx.model?.id ?? "no-model";
					const cwd = state.showFullPath ? shortenPath(ctx.cwd) : basename(ctx.cwd);
					const thinkingLevel = pi.getThinkingLevel();
					const ctxUsage = ctx.getContextUsage();
					const sep = " " + theme.fg("dim", "▸") + " ";

					// ── Shared segments ──
					const segModelThink = formatModelThink(model, thinkingLevel, theme);
					const segRuntime = theme.fg("dim", `⏱ ${fmtDuration(runtime)}`);
					const segPwd = theme.fg("dim", `📁 ${cwd}`);

					let segGit = "";
					if (branch) {
						segGit = theme.fg("dim", ` ${branch}`);
						if (diffAdded > 0 || diffRemoved > 0) {
							segGit += ` ${theme.fg("success", `+${diffAdded}`)} ${theme.fg("error", `-${diffRemoved}`)}`;
						}
					}

					const segCtx = ctxUsage
						? theme.fg(
								"dim",
								`ctx ${fmtTokens(ctxUsage.tokens || 0)}/${fmtTokens(ctxUsage.contextWindow)}`,
							)
						: "";

					const segTokens = theme.fg("dim", `↑${fmtTokens(totalIn)} ↓${fmtTokens(totalOut)}`);

					let segTps = "";
					if (state.isStreaming && state.currentTurnStartTime) {
						const elapsed =
							(Date.now() - state.currentTurnStartTime) / 1000;
						const liveTps =
							elapsed > 0 ? state.currentTurnUpdateCount / elapsed : 0;
						segTps = theme.fg("accent", `⚡${liveTps.toFixed(1)}`);
					} else if (state.turns.length > 0) {
						const last = state.turns[state.turns.length - 1];
						segTps = theme.fg("dim", `⚡${last.tps.toFixed(1)}`);
					}

					const segCost = theme.fg("dim", `$${totalCost.toFixed(4)}`);

					// ── Try single line ──
					const leftParts = [segModelThink];
					const rightParts = [segCtx, segTokens, segTps, segCost].filter(Boolean);
					const middleParts = [segRuntime, segPwd, segGit].filter(Boolean);

					const leftStr = leftParts.join(sep);
					const rightStr = rightParts.join(sep);
					const middleStr = middleParts.join(sep);

					const singleLine = middleStr
						? leftStr + sep + middleStr + sep + rightStr
						: leftStr + sep + rightStr;

					if (visibleWidth(singleLine) <= width) {
						const pad = width - visibleWidth(singleLine);
						return [singleLine + " ".repeat(pad)];
					}

					// ── Fallback: two lines ──
					function fitLine(parts: string[]): string {
						const line = parts.filter(Boolean).join(sep);
						const w = visibleWidth(line);
						if (w < width) return line + " ".repeat(width - w);
						if (w > width) return truncateToWidth(line, width);
						return line;
					}

					const line1 = fitLine([segModelThink, segPwd, segGit]);
					const line2 = fitLine([segRuntime, segCtx, segTokens, segTps, segCost]);
					return [line1, line2];
				},
			};
		});
	}

	function teardownFooter(ctx: ExtensionContext) {
		ctx.ui.setFooter(undefined);
	}

	/* ─── Commands ─── */

	pi.registerCommand("obs", {
		description:
			"Show observability dashboard (tokens, cost, TPS, runtime, history)",
		handler: async (_args, ctx) => {
			const branchResult = await pi.exec("git", ["branch", "--show-current"], {
				cwd: ctx.cwd,
			});
			const branch = branchResult.stdout?.trim() || null;
			const history = await loadHistory();

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				let cachedWidth = 0;
				let cachedLines: string[] = [];

				return {
					invalidate() {
						cachedWidth = 0;
						cachedLines = [];
					},
					handleInput(data: string) {
						if (
							matchesKey(data, Key.escape) ||
							matchesKey(data, Key.enter) ||
							matchesKey(data, Key.space)
						) {
							done();
						}
					},
					render(width: number): string[] {
						if (cachedWidth === width && cachedLines.length > 0) {
							return cachedLines;
						}

						cachedLines = buildDashboard(
							state,
							ctx,
							branch,
							history,
							width,
							theme,
						);

						// Add hint at bottom
						const hint = theme.fg("dim", "Press ESC or Enter to close");
						const hintVisible = visibleWidth(hint);
						const pad = Math.max(0, width - hintVisible);
						cachedLines.push("");
						cachedLines.push(hint + " ".repeat(pad));

						cachedWidth = width;
						return cachedLines;
					},
				};
			});
		},
	});

	pi.registerCommand("obs-toggle", {
		description: "Toggle the observability footer on/off",
		handler: async (_args, ctx) => {
			state.footerEnabled = !state.footerEnabled;
			if (state.footerEnabled) {
				setupFooter(ctx);
				ctx.ui.notify("Observability footer enabled", "info");
			} else {
				teardownFooter(ctx);
				ctx.ui.notify("Observability footer disabled", "info");
			}
		},
	});

	pi.registerCommand("obs-toggle-path", {
		description: "Toggle between folder name and full path in footer",
		handler: async (_args, ctx) => {
			state.showFullPath = !state.showFullPath;
			const mode = state.showFullPath ? "full path" : "folder name";
			ctx.ui.notify(`Footer path: ${mode}`, "info");
		},
	});
}
