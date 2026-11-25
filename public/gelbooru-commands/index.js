// Vendetta/Bunny plugin: dynamic slash commands that post a random Gelbooru image.
// Loaded by Revenge Classic (Bunny-compatible). Runs as a single IIFE that returns lifecycle hooks.
(function () {
	"use strict";

	const GELBOORU = "https://gelbooru.com/index.php";
	// Lowercase letters, digits, underscore, hyphen. Discord-style command names.
	const NAME_RE = /^[a-z0-9_-]{1,32}$/;
	// Names this plugin owns. Dynamic commands cannot use them.
	const RESERVED = new Set(["gelbooru_create", "gelbooru_remove", "gelbooru_auth"]);
	// Vendetta option type for STRING.
	const CMD_STRING = 3;

	// Discord internals found by their exported property names.
	const Messages = vendetta.metro.findByProps("sendMessage", "receiveMessage");
	const Creator = vendetta.metro.findByProps("createBotMessage");
	const Channels = vendetta.metro.findByProps("getLastSelectedChannelId");

	// Per-plugin persistent storage. Holds API credentials and saved commands.
	const store = vendetta.plugin.storage;

	// Command name -> unregister function, so commands can be removed or reloaded.
	const registered = new Map();

	// Returns the saved command map, creating it on first use.
	function getStored() {
		store.commands ??= {};
		return store.commands;
	}

	// Builds the final tag string. Strips user sort tags, adds rating:general when no rating is set,
	// then adds sort:random so each call returns a different image.
	function buildTags(raw) {
		let tags = String(raw).replace(/\bsort:\S+/g, "").trim();
		if (!/(^|\s)rating:/.test(tags)) tags += " rating:general";
		return `${tags} sort:random`.trim();
	}

	// Builds the Gelbooru dapi URL for one random post. Adds credentials when both are set.
	function buildUrl(tags) {
		const params = {
			page: "dapi",
			s: "post",
			q: "index",
			json: "1",
			limit: "1",
			tags: buildTags(tags),
		};
		if (store.apiKey && store.userId) {
			params.api_key = store.apiKey;
			params.user_id = store.userId;
		}
		// Hand-built query string. Hermes does not reliably provide URLSearchParams.
		const query = Object.entries(params)
			.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
			.join("&");
		return `${GELBOORU}?${query}`;
	}

	// Fetches one random post and returns its image URL. Throws with a user-facing message on failure.
	async function fetchRandomImage(tags) {
		const res = await fetch(buildUrl(tags));
		if (!res.ok) {
			throw new Error(`Gelbooru returned HTTP ${res.status}. Set your API key with /gelbooru_auth.`);
		}

		// Gelbooru returns an error page instead of JSON when credentials are wrong.
		let data;
		try {
			data = JSON.parse(await res.text());
		} catch {
			throw new Error("Gelbooru didn't return JSON. Check your API credentials.");
		}

		// The post list key differs between responses, so check both.
		const posts = data?.post ?? data?.posts ?? [];
		const url = posts[0]?.file_url;
		if (!url) throw new Error("No image matched those tags.");
		return url;
	}

	// Shows a message only to the user. Nothing is sent to the channel.
	function localReply(channelId, content) {
		const msg = Creator.createBotMessage({ channelId, content, embeds: [] });
		Messages.receiveMessage(channelId, msg);
	}

	// Strips a leading slash and lowercases a command name.
	function normalizeName(raw) {
		return String(raw ?? "").replace(/^\//, "").toLowerCase();
	}

	// Registers one saved command. Re-registering replaces the previous one with the same name.
	function registerDynamic(name, tags) {
		registered.get(name)?.();
		const unregister = vendetta.commands.registerCommand({
			name,
			displayName: name,
			description: `Random Gelbooru image: ${tags}`,
			displayDescription: `Random Gelbooru image: ${tags}`,
			options: [],
			applicationId: "-1",
			inputType: 1,
			type: 1,
			execute: async (_args, ctx) => {
				// Prefer the channel the command ran in. Fall back to the last selected channel.
				const channelId = ctx?.channel?.id ?? Channels.getLastSelectedChannelId();
				try {
					const url = await fetchRandomImage(tags);
					// Sent as the user. Discord embeds the image URL.
					Messages.sendMessage(channelId, { content: url });
				} catch (e) {
					vendetta.logger.log(e);
					localReply(channelId, `⚠️ ${e?.message ?? "Unknown error"}`);
				}
			},
		});
		registered.set(name, unregister);
	}

	// Registers the three management commands: create, remove, and auth.
	function registerManagement() {
		// Builds a required STRING option.
		const option = (name, description) => ({
			name,
			displayName: name,
			description,
			displayDescription: description,
			required: true,
			type: CMD_STRING,
		});

		// Fields shared by every command this plugin registers.
		const base = {
			applicationId: "-1",
			inputType: 1,
			type: 1,
		};

		registered.set(
			"gelbooru_create",
			vendetta.commands.registerCommand({
				...base,
				name: "gelbooru_create",
				displayName: "gelbooru_create",
				description: "Create a command that returns a random Gelbooru image",
				displayDescription: "Create a command that returns a random Gelbooru image",
				options: [
					option("tags", "Gelbooru tags, e.g. adachi_rei"),
					option("command", "Command name, without /"),
				],
				execute: (args, ctx) => {
					const channelId = ctx?.channel?.id ?? Channels.getLastSelectedChannelId();
					const tags = args.find((a) => a.name === "tags")?.value ?? "";
					const name = normalizeName(args.find((a) => a.name === "command")?.value);

					if (!NAME_RE.test(name)) {
						return localReply(channelId, "Command names must be 1–32 characters: a–z, 0–9, _ or -.");
					}
					if (RESERVED.has(name)) return localReply(channelId, `/${name} is reserved.`);
					if (getStored()[name]) {
						return localReply(channelId, `/${name} already exists. Remove it first with /gelbooru_remove.`);
					}

					// Save first so the command survives a reload, then register it live.
					getStored()[name] = tags;
					registerDynamic(name, tags);
					localReply(channelId, `Created /${name} → random Gelbooru image for "${tags}".`);
				},
			}),
		);

		registered.set(
			"gelbooru_remove",
			vendetta.commands.registerCommand({
				...base,
				name: "gelbooru_remove",
				displayName: "gelbooru_remove",
				description: "Remove a command created with /gelbooru_create",
				displayDescription: "Remove a command created with /gelbooru_create",
				options: [option("command", "Command name, without /")],
				execute: (args, ctx) => {
					const channelId = ctx?.channel?.id ?? Channels.getLastSelectedChannelId();
					const name = normalizeName(args.find((a) => a.name === "command")?.value);
					const commands = getStored();

					if (!commands[name]) return localReply(channelId, `No custom command /${name}.`);

					// Unregister first, then remove from storage.
					registered.get(name)?.();
					registered.delete(name);
					delete commands[name];
					localReply(channelId, `Removed /${name}.`);
				},
			}),
		);

		registered.set(
			"gelbooru_auth",
			vendetta.commands.registerCommand({
				...base,
				name: "gelbooru_auth",
				displayName: "gelbooru_auth",
				description: "Set your Gelbooru API key and user ID",
				displayDescription: "Set your Gelbooru API key and user ID",
				options: [option("api_key", "Gelbooru API key"), option("user_id", "Gelbooru user ID")],
				execute: (args, ctx) => {
					const channelId = ctx?.channel?.id ?? Channels.getLastSelectedChannelId();
					store.apiKey = args.find((a) => a.name === "api_key")?.value;
					store.userId = args.find((a) => a.name === "user_id")?.value;
					// Reply does not echo the key back.
					localReply(channelId, "Gelbooru credentials saved.");
				},
			}),
		);
	}

	// Lifecycle hooks read by Vendetta.
	return {
		// Registers management commands, then restores saved dynamic commands.
		onLoad() {
			store.commands ??= {};
			registerManagement();
			for (const [name, tags] of Object.entries(store.commands)) {
				registerDynamic(name, tags);
			}
		},
		// Unregisters every command this plugin registered.
		onUnload() {
			for (const unregister of registered.values()) unregister();
			registered.clear();
		},
	};
})();
