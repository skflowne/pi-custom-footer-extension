import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

import type { ExtensionAPI, ExtensionContext, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const CONFIG_NAME = "custom-footer.json";
const CONFIG_DIR = ".pi/agent";

const THEME_COLORS = new Set<ThemeColor>([
	"accent",
	"border",
	"borderAccent",
	"borderMuted",
	"success",
	"error",
	"warning",
	"muted",
	"dim",
	"text",
	"thinkingText",
	"userMessageText",
	"customMessageText",
	"customMessageLabel",
	"toolTitle",
	"toolOutput",
	"mdHeading",
	"mdLink",
	"mdLinkUrl",
	"mdCode",
	"mdCodeBlock",
	"mdCodeBlockBorder",
	"mdQuote",
	"mdQuoteBorder",
	"mdHr",
	"mdListBullet",
	"toolDiffAdded",
	"toolDiffRemoved",
	"toolDiffContext",
	"syntaxComment",
	"syntaxKeyword",
	"syntaxFunction",
	"syntaxVariable",
	"syntaxString",
	"syntaxNumber",
	"syntaxType",
	"syntaxOperator",
	"syntaxPunctuation",
	"thinkingOff",
	"thinkingMinimal",
	"thinkingLow",
	"thinkingMedium",
	"thinkingHigh",
	"thinkingXhigh",
	"thinkingMax",
	"bashMode",
]);

export type FooterConfig = {
	contextThresholds: Array<{ minPercent: number; color: ThemeColor }>;
	excludedExtensionStatuses: string[];
	showCwdAndGitBranch: boolean;
	preserveStatusColors: boolean;
	colors: {
		cwd: ThemeColor;
		branch: ThemeColor;
		session: ThemeColor;
		input: ThemeColor;
		output: ThemeColor;
		cost: ThemeColor;
		separator: ThemeColor;
		model: ThemeColor;
		thinking: ThemeColor;
		status: ThemeColor;
	};
};

/** Edit ~/.pi/agent/custom-footer.json or .pi/custom-footer.json to override these defaults. */
const DEFAULT_CONFIG: FooterConfig = {
	contextThresholds: [
		{ minPercent: 0, color: "dim" },
		{ minPercent: 60, color: "warning" },
		{ minPercent: 85, color: "error" },
	],
	excludedExtensionStatuses: [],
	showCwdAndGitBranch: true,
	preserveStatusColors: true,
	colors: {
		cwd: "dim",
		branch: "dim",
		session: "dim",
		input: "dim",
		output: "dim",
		cost: "dim",
		separator: "dim",
		model: "dim",
		thinking: "dim",
		status: "text",
	},
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThemeColor(value: unknown): value is ThemeColor {
	return typeof value === "string" && THEME_COLORS.has(value as ThemeColor);
}

function mergeConfig(base: FooterConfig, value: unknown): FooterConfig {
	if (!isObject(value)) return base;

	const next: FooterConfig = {
		...base,
		contextThresholds: [...base.contextThresholds],
		excludedExtensionStatuses: [...base.excludedExtensionStatuses],
		colors: { ...base.colors },
	};

	if (Array.isArray(value.contextThresholds)) {
		const thresholds = value.contextThresholds
			.filter(isObject)
			.map((threshold) => ({
				minPercent: threshold.minPercent,
				color: threshold.color,
			}))
			.filter(
				(threshold): threshold is { minPercent: number; color: ThemeColor } =>
					typeof threshold.minPercent === "number" &&
					Number.isFinite(threshold.minPercent) &&
					isThemeColor(threshold.color),
			)
			.sort((a, b) => a.minPercent - b.minPercent);
		if (thresholds.length > 0) next.contextThresholds = thresholds;
	}

	if (Array.isArray(value.excludedExtensionStatuses)) {
		next.excludedExtensionStatuses = [
			...new Set(value.excludedExtensionStatuses.filter((status): status is string => typeof status === "string")),
		];
	}

	if (typeof value.showCwdAndGitBranch === "boolean") {
		next.showCwdAndGitBranch = value.showCwdAndGitBranch;
	}

	if (typeof value.preserveStatusColors === "boolean") {
		next.preserveStatusColors = value.preserveStatusColors;
	}

	if (isObject(value.colors)) {
		for (const key of Object.keys(next.colors) as Array<keyof FooterConfig["colors"]>) {
			if (isThemeColor(value.colors[key])) next.colors[key] = value.colors[key];
		}
	}

	return next;
}

async function loadConfig(ctx: ExtensionContext): Promise<FooterConfig> {
	let config = DEFAULT_CONFIG;
	const paths = [
		join(homedir(), CONFIG_DIR, CONFIG_NAME),
		join(ctx.cwd, ".pi", CONFIG_NAME),
	];

	for (const path of paths) {
		try {
			config = mergeConfig(config, JSON.parse(await readFile(path, "utf8")));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				ctx.ui.notify(`Could not read ${path}: ${String(error)}`, "warning");
			}
		}
	}

	return config;
}

function formatTokens(count: number): string {
	if (count < 1_000) return String(count);
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

function formatCwd(cwd: string): string {
	const home = homedir();
	const relativeToHome = relative(resolve(home), resolve(cwd));
	const insideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !relativeToHome.startsWith(sep));
	if (!insideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function sanitizeStatusText(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function stripAnsi(text: string): string {
	return text.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, "");
}

function contextColor(percent: number, thresholds: FooterConfig["contextThresholds"]): ThemeColor {
	let color: ThemeColor = "text";
	for (const threshold of thresholds) {
		if (percent >= threshold.minPercent) color = threshold.color;
		else break;
	}
	return color;
}

function dimRemainder(theme: { fg(color: ThemeColor, text: string): string }, text: string): string {
	return theme.fg("dim", text);
}

export default function (pi: ExtensionAPI): void {
	let config = DEFAULT_CONFIG;
	let activeTui: { requestRender(): void } | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		config = DEFAULT_CONFIG;

		ctx.ui.setFooter((tui, theme, footerData) => {
			activeTui = tui;
			const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsubscribeBranch,
				invalidate() {},
				render(width: number): string[] {
					let totalInput = 0;
					let totalOutput = 0;
					let totalCost = 0;

					for (const entry of ctx.sessionManager.getEntries()) {
						if (entry.type !== "message" || entry.message.role !== "assistant") continue;
						totalInput += entry.message.usage.input;
						totalOutput += entry.message.usage.output;
						totalCost += entry.message.usage.cost.total;
					}

					const branch = footerData.getGitBranch();
					const sessionName = ctx.sessionManager.getSessionName();
					let cwdLine = theme.fg(config.colors.cwd, formatCwd(ctx.cwd));
					if (branch) cwdLine += ` ${theme.fg(config.colors.branch, `(${branch})`)}`;
					if (sessionName) cwdLine += ` ${theme.fg(config.colors.session, `• ${sessionName}`)}`;
					const firstLine = truncateToWidth(cwdLine, width, theme.fg(config.colors.cwd, "..."));

					const statsParts: string[] = [];
					const dot = theme.fg(config.colors.separator, "·");
					if (totalInput) statsParts.push(theme.fg(config.colors.input, `↑${formatTokens(totalInput)}`));
					if (totalOutput) statsParts.push(theme.fg(config.colors.output, `↓${formatTokens(totalOutput)}`));
					if (totalCost) statsParts.push(theme.fg(config.colors.cost, `$${totalCost.toFixed(3)}`));

					const usage = ctx.getContextUsage();
					const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const knownPercent = usage?.percent !== null && usage?.percent !== undefined;
					const formattedWindow = contextWindow > 0 ? formatTokens(contextWindow) : "?";
					const contextDisplay = knownPercent
						? `${usage!.percent!.toFixed(1)}%/${formattedWindow}`
						: `?/${formattedWindow}`;
					const contextText = knownPercent
						? theme.fg(contextColor(usage!.percent!, config.contextThresholds), contextDisplay)
						: theme.fg(config.colors.separator, contextDisplay);
					statsParts.push(contextText);

					let statsLeft = statsParts.join(" ");
					let statsLeftWidth = visibleWidth(statsLeft);
					if (statsLeftWidth > width) {
						statsLeft = truncateToWidth(statsLeft, width, theme.fg(config.colors.separator, "..."));
						statsLeftWidth = visibleWidth(statsLeft);
					}

					const model = ctx.model?.id ?? "no-model";
					const modelLabel = theme.fg(config.colors.model, model);
					const thinking = ctx.model?.reasoning ? pi.getThinkingLevel() : undefined;
					const effortLabel = thinking ? theme.fg(config.colors.thinking, `effort ${thinking}`) : "";
					const modelText = effortLabel ? `${modelLabel} ${dot} ${effortLabel}` : modelLabel;
					let rightSide =
						footerData.getAvailableProviderCount() > 1 && ctx.model
							? `${theme.fg(config.colors.model, `(${ctx.model.provider})`)} ${modelText}`
							: modelText;
					if (footerData.getAvailableProviderCount() > 1 && statsLeftWidth + 2 + visibleWidth(rightSide) > width) {
						rightSide = modelText;
					}

					const rightSideWidth = visibleWidth(rightSide);
					const totalNeeded = statsLeftWidth + 2 + rightSideWidth;
					let statsLine: string;
					if (totalNeeded <= width) {
						const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
						statsLine = statsLeft + padding + rightSide;
					} else {
						const availableForRight = width - statsLeftWidth - 2;
						if (availableForRight > 0) {
							const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
							const padding = " ".repeat(Math.max(0, width - statsLeftWidth - visibleWidth(truncatedRight)));
							statsLine = statsLeft + padding + truncatedRight;
						} else {
							statsLine = statsLeft;
						}
					}

					const dimStatsLeft = theme.fg("dim", statsLeft);
					const remainder = statsLine.slice(statsLeft.length);
					const secondLine = dimStatsLeft + dimRemainder(theme, remainder);

					const statuses = Array.from(footerData.getExtensionStatuses())
						.filter(([id]) => !config.excludedExtensionStatuses.includes(id))
						.map(([, text]) => text)
						.sort((a, b) => a.localeCompare(b))
						.map((text) => {
							const clean = sanitizeStatusText(text);
							return config.preserveStatusColors
								? clean
								: theme.fg(config.colors.status, stripAnsi(clean));
						});
					const lines = config.showCwdAndGitBranch ? [firstLine, secondLine] : [secondLine];
					if (statuses.length > 0) lines.push(truncateToWidth(statuses.join(" "), width, theme.fg(config.colors.cwd, "...")));
					return lines;
				},
			};
		});

		void loadConfig(ctx).then((loaded) => {
			config = loaded;
			activeTui?.requestRender();
		});
	});

	pi.on("session_shutdown", (_event, ctx) => {
		activeTui = undefined;
		if (ctx.hasUI) ctx.ui.setFooter(undefined);
	});
}
