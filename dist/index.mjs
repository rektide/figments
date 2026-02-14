import { t as __exportAll } from "./chunk-DQk6qfdC.mjs";
import * as TOML from "@iarna/toml";
import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import YAML from "yaml";

//#region src/profile.ts
const DEFAULT_PROFILE = "default";
const GLOBAL_PROFILE = "global";
function normalizeProfile(profile) {
	return profile.trim().toLowerCase();
}
function isCustomProfile(profile) {
	return profile !== DEFAULT_PROFILE && profile !== GLOBAL_PROFILE;
}
function profileFromEnv(key) {
	const lowered = key.toLowerCase();
	for (const [envKey, value] of Object.entries(process.env)) if (envKey.trim().toLowerCase() === lowered && value !== void 0) return normalizeProfile(value);
}
function profileFromEnvOr(key, fallback) {
	return profileFromEnv(key) ?? normalizeProfile(fallback);
}

//#endregion
//#region src/core/types.ts
function isConfigDict(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function deepClone(value) {
	if (Array.isArray(value)) return value.map((item) => deepClone(item));
	if (isConfigDict(value)) {
		const copy = {};
		for (const [key, item] of Object.entries(value)) copy[key] = deepClone(item);
		return copy;
	}
	return value;
}

//#endregion
//#region src/core/tag.ts
const dictChildrenIndexCache = /* @__PURE__ */ new WeakMap();
function buildTagTree(value, tag) {
	if (Array.isArray(value)) return {
		kind: "array",
		tag,
		children: value.map((item) => buildTagTree(item, tag))
	};
	if (isConfigDict(value)) {
		const children = [];
		for (const [key, item] of Object.entries(value)) children.push({
			...buildTagTree(item, tag),
			key
		});
		return {
			kind: "dict",
			tag,
			children
		};
	}
	return {
		kind: "scalar",
		tag
	};
}
function buildTagProfileMap(values, tag) {
	const map = {};
	for (const [profile, dict] of Object.entries(values)) map[profile] = buildTagTree(dict, retagForProfile(tag, profile));
	return map;
}
function isTagDictNode(value) {
	return value.kind === "dict";
}
function isTagArrayNode(value) {
	return value.kind === "array";
}
function dictChildrenIndex(node) {
	const cached = dictChildrenIndexCache.get(node);
	if (cached) return cached;
	const index = /* @__PURE__ */ new Map();
	for (const child of node.children) index.set(child.key, child);
	dictChildrenIndexCache.set(node, index);
	return index;
}
function cloneTagTree(value) {
	if (value.kind === "array") return {
		kind: "array",
		tag: value.tag,
		key: value.key,
		children: value.children.map((item) => cloneTagTree(item))
	};
	if (value.kind === "dict") return {
		kind: "dict",
		tag: value.tag,
		key: value.key,
		children: value.children.map((item) => cloneTagTree(item))
	};
	return {
		kind: "scalar",
		tag: value.tag,
		key: value.key
	};
}
function cloneTagDictNode(value) {
	return cloneTagTree(value);
}
function cloneProfileTagMap(map) {
	const out = {};
	for (const [profile, node] of Object.entries(map)) out[profile] = cloneTagDictNode(node);
	return out;
}
function remapProfileTagMap(map, tagMap) {
	const out = {};
	for (const [profile, node] of Object.entries(map)) out[profile] = remapTagTree(node, tagMap);
	return out;
}
function remapTagTree(value, tagMap) {
	const tag = {
		metadataId: tagMap.get(value.tag.metadataId) ?? value.tag.metadataId,
		profile: value.tag.profile
	};
	if (value.kind === "array") return {
		kind: "array",
		tag,
		key: value.key,
		children: value.children.map((item) => remapTagTree(item, tagMap))
	};
	if (value.kind === "dict") return {
		kind: "dict",
		tag,
		key: value.key,
		children: value.children.map((item) => remapTagTree(item, tagMap))
	};
	return {
		kind: "scalar",
		tag,
		key: value.key
	};
}
function makeTag(metadataId, profile) {
	return {
		metadataId,
		profile
	};
}
function retagForProfile(tag, profile) {
	return {
		metadataId: tag.metadataId,
		profile
	};
}

//#endregion
//#region src/core/coalesce.ts
function profileCoalesce(current, incoming, order) {
	switch (order) {
		case "join":
		case "adjoin": return current;
		case "merge":
		case "admerge": return incoming;
	}
}
function coalesceProfiles(current, incoming, order) {
	const out = {};
	const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);
	for (const key of keys) if (current[key] && incoming[key]) out[key] = coalesceDict(current[key], incoming[key], order);
	else if (current[key]) out[key] = deepClone(current[key]);
	else if (incoming[key]) out[key] = deepClone(incoming[key]);
	return out;
}
function coalesceDict(current, incoming, order) {
	const out = {};
	const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);
	for (const key of keys) if (key in current && key in incoming) out[key] = coalesceValue(current[key], incoming[key], order);
	else if (key in current) out[key] = deepClone(current[key]);
	else out[key] = deepClone(incoming[key]);
	return out;
}
function coalesceValue(current, incoming, order) {
	if (isConfigDict(current) && isConfigDict(incoming)) return coalesceDict(current, incoming, order);
	if (Array.isArray(current) && Array.isArray(incoming)) {
		if (order === "adjoin" || order === "admerge") return [...deepClone(current), ...deepClone(incoming)];
		return order === "join" ? deepClone(current) : deepClone(incoming);
	}
	if (order === "join" || order === "adjoin") return deepClone(current);
	return deepClone(incoming);
}
function coalesceTagProfiles(current, incoming, order) {
	const out = {};
	const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);
	for (const key of keys) if (current[key] && incoming[key]) out[key] = coalesceTagDictNode(current[key], incoming[key], order);
	else if (current[key]) out[key] = deepCloneTag(current[key]);
	else if (incoming[key]) out[key] = deepCloneTag(incoming[key]);
	return out;
}
function coalesceTagDictNode(current, incoming, order) {
	return {
		kind: "dict",
		key: current.key ?? incoming.key,
		tag: prefersCurrent(order) ? current.tag : incoming.tag,
		children: coalesceDictChildren(current, incoming, order)
	};
}
function coalesceTagValue(current, incoming, order) {
	if (isTagDictNode(current) && isTagDictNode(incoming)) return coalesceTagDictNode(current, incoming, order);
	if (isTagArrayNode(current) && isTagArrayNode(incoming)) {
		if (order === "adjoin" || order === "admerge") return {
			kind: "array",
			key: current.key ?? incoming.key,
			tag: prefersCurrent(order) ? current.tag : incoming.tag,
			children: [...current.children.map((item) => deepCloneTag(item)), ...incoming.children.map((item) => deepCloneTag(item))]
		};
		return order === "join" ? deepCloneTag(current) : deepCloneTag(incoming);
	}
	if (order === "join" || order === "adjoin") return deepCloneTag(current);
	return deepCloneTag(incoming);
}
function coalesceDictChildren(current, incoming, order) {
	const byCurrent = dictChildrenIndex(current);
	const byIncoming = dictChildrenIndex(incoming);
	const keys = new Set([...byCurrent.keys(), ...byIncoming.keys()]);
	const out = [];
	for (const key of keys) {
		const left = byCurrent.get(key);
		const right = byIncoming.get(key);
		if (left && right) out.push({
			...coalesceTagValue(left, right, order),
			key
		});
		else if (left) out.push(deepCloneTag(left));
		else if (right) out.push(deepCloneTag(right));
	}
	return out;
}
function deepCloneTag(value) {
	if (isTagArrayNode(value)) return {
		kind: "array",
		tag: value.tag,
		key: value.key,
		children: value.children.map((item) => deepCloneTag(item))
	};
	if (isTagDictNode(value)) return {
		kind: "dict",
		tag: value.tag,
		key: value.key,
		children: value.children.map((item) => deepCloneTag(item))
	};
	return {
		kind: "scalar",
		tag: value.tag,
		key: value.key
	};
}
function prefersCurrent(order) {
	return order === "join" || order === "adjoin";
}

//#endregion
//#region src/core/metadata.ts
const SourceKind = {
	File: "file",
	Env: "env",
	Inline: "inline"
};
function metadataNamed(name) {
	return {
		name,
		interpolate: (profile, keys) => `${profile}.${keys.join(".")}`
	};
}
function metadataFromFile(name, path) {
	return {
		...metadataNamed(name),
		source: {
			kind: SourceKind.File,
			value: path
		}
	};
}
function metadataFromEnv(name, selector) {
	return {
		...metadataNamed(name),
		source: {
			kind: SourceKind.Env,
			value: selector
		}
	};
}
function metadataFromInline(name, descriptor) {
	return {
		...metadataNamed(name),
		source: {
			kind: SourceKind.Inline,
			value: descriptor
		}
	};
}
function formatMetadataSource(source) {
	if (!source) return "";
	if (source.kind === SourceKind.File) return `file ${source.value}`;
	if (source.kind === SourceKind.Env) return `environment ${source.value}`;
	return source.value;
}

//#endregion
//#region src/core/error.ts
var FigmentError = class FigmentError extends Error {
	kind;
	tag;
	path;
	profile;
	metadata;
	previous;
	constructor(kind, message, options) {
		super(message);
		this.name = "FigmentError";
		this.kind = kind;
		this.tag = options?.tag;
		this.path = options?.path ?? [];
		this.profile = options?.profile;
		this.metadata = options?.metadata;
		this.previous = options?.previous;
	}
	withPath(path) {
		return new FigmentError(this.kind, this.message, {
			path: [...this.path, ...path.split(".").filter(Boolean)],
			tag: this.tag,
			profile: this.profile,
			metadata: this.metadata,
			previous: this.previous
		});
	}
	chain(previous) {
		return new FigmentError(this.kind, this.message, {
			path: this.path,
			tag: this.tag,
			profile: this.profile,
			metadata: this.metadata,
			previous
		});
	}
	toString() {
		const keySuffix = this.path.length > 0 ? ` for key '${this.path.join(".")}'` : "";
		const source = formatMetadataSource(this.metadata?.source);
		const sourceSuffix = this.metadata?.source ? ` in ${source} ${this.metadata.name}` : this.metadata ? ` in ${this.metadata.name}` : "";
		const base = `${this.message}${keySuffix}${sourceSuffix}`;
		if (!this.previous) return base;
		return `${base}\n${this.previous.toString()}`;
	}
	static missingField(path) {
		return new FigmentError("MissingField", `missing field '${path}'`, { path: path.split(".").filter(Boolean) });
	}
	static message(message) {
		return new FigmentError("Message", message);
	}
	withContext(options) {
		return new FigmentError(this.kind, this.message, {
			path: this.path,
			tag: options.tag ?? this.tag,
			profile: options.profile ?? this.profile,
			metadata: options.metadata ?? this.metadata,
			previous: this.previous
		});
	}
};

//#endregion
//#region src/core/path.ts
function findValue(dict, path) {
	if (path.length === 0) return dict;
	const keys = path.split(".").filter(Boolean);
	let current = dict;
	for (const key of keys) {
		if (!isConfigDict(current)) return;
		if (!(key in current)) return;
		current = current[key];
	}
	return current;
}
function nest(path, value) {
	const keys = path.split(".").map((k) => k.trim()).filter(Boolean);
	if (keys.length === 0) return {};
	let out = { [keys[keys.length - 1]]: value };
	for (let i = keys.length - 2; i >= 0; i -= 1) out = { [keys[i]]: out };
	return out;
}
function findTag(dict, path) {
	if (path.length === 0) return dict;
	const keys = path.split(".").filter(Boolean);
	let current = dict;
	for (const key of keys) {
		if (!isTagDictNode(current)) return;
		const child = dictChildrenIndex(current).get(key);
		if (!child) return;
		current = child;
	}
	return current;
}

//#endregion
//#region src/figment.ts
var Figment = class Figment {
	activeProfile;
	metadataByTag;
	values;
	tags;
	failure;
	nextTag;
	pending;
	constructor() {
		this.activeProfile = DEFAULT_PROFILE;
		this.metadataByTag = /* @__PURE__ */ new Map();
		this.values = {};
		this.tags = {};
		this.failure = void 0;
		this.nextTag = 1;
		this.pending = Promise.resolve();
	}
	static new() {
		return new Figment();
	}
	static from(provider) {
		return new Figment().provide(provider, "merge", captureProvideLocation());
	}
	metadata() {
		return {
			name: "Figment",
			interpolate: (profile, keys) => `${profile}.${keys.join(".")}`
		};
	}
	async data() {
		await this.ready();
		return deepClone(this.values);
	}
	profile() {
		return this.activeProfile;
	}
	selectedProfile() {
		return this.activeProfile;
	}
	metadataEntries() {
		return [...this.metadataByTag.values()];
	}
	metadataMap() {
		return new Map(this.metadataByTag.entries());
	}
	tagMap() {
		return cloneProfileTagMap(this.tags);
	}
	getMetadata(tag) {
		return this.metadataByTag.get(tag.metadataId);
	}
	async findMetadata(path) {
		const tag = await this.findTagForPath(path);
		return tag === void 0 ? void 0 : this.metadataByTag.get(tag.metadataId);
	}
	select(profile) {
		this.activeProfile = normalizeProfile(profile);
		return this;
	}
	join(provider) {
		return this.provide(provider, "join", captureProvideLocation());
	}
	adjoin(provider) {
		return this.provide(provider, "adjoin", captureProvideLocation());
	}
	merge(provider) {
		return this.provide(provider, "merge", captureProvideLocation());
	}
	admerge(provider) {
		return this.provide(provider, "admerge", captureProvideLocation());
	}
	async profiles() {
		await this.ready();
		return Object.keys(this.values);
	}
	async extract(decode) {
		const value = await this.merged();
		return decode ? decode(value) : value;
	}
	async extractLossy(decode) {
		const value = lossyConfig(await this.merged());
		return decode ? decode(value) : value;
	}
	async extractInner(path) {
		return await this.findValue(path);
	}
	async extractInnerLossy(path) {
		return lossyValue(await this.findValue(path));
	}
	async contains(path) {
		try {
			await this.findValue(path);
			return true;
		} catch {
			return false;
		}
	}
	async findValue(path) {
		const value = findValue((await this.mergedState()).value, path);
		if (value === void 0) throw FigmentError.missingField(path);
		return value;
	}
	focus(path) {
		const focused = new Figment();
		focused.pending = this.pending.then(async () => {
			if (this.failure) {
				focused.failure = this.failure;
				return;
			}
			focused.activeProfile = this.activeProfile;
			focused.nextTag = this.nextTag;
			for (const [metadataId, metadata] of this.metadataByTag.entries()) focused.metadataByTag.set(metadataId, metadata);
			const map = {};
			const tags = {};
			for (const [profile, dict] of Object.entries(this.values)) {
				const value = findValue(dict, path);
				const tree = this.tags[profile] ? findTag(this.tags[profile], path) : void 0;
				if (isConfigDict(value)) {
					map[profile] = deepClone(value);
					if (tree && isTagDictNode(tree)) tags[profile] = cloneTagDictNode(tree);
				}
			}
			focused.values = map;
			focused.tags = tags;
		});
		return focused;
	}
	async ready() {
		await this.pending;
		if (this.failure) throw this.failure;
	}
	provide(provider, order, provideLocation) {
		const providerProfile = provider.selectedProfile?.();
		if (providerProfile) this.activeProfile = profileCoalesce(this.activeProfile, normalizeProfile(providerProfile), order);
		this.pending = this.pending.then(async () => {
			if (this.failure) return;
			let contextTag;
			let contextMetadata;
			try {
				let incoming;
				let incomingTags;
				const importedMetadataMap = provider.metadataMap?.();
				const importedTagMap = provider.tagMap?.();
				if (importedMetadataMap && importedTagMap) {
					const remap = this.importMetadataMap(importedMetadataMap);
					incoming = normalizeProfiles(await provider.data());
					incomingTags = remapProfileTagMap(cloneProfileTagMap(importedTagMap), remap);
				} else {
					contextTag = this.allocateTag(this.activeProfile);
					contextMetadata = provider.metadata();
					contextMetadata.provideLocation = provideLocation;
					this.metadataByTag.set(contextTag.metadataId, contextMetadata);
					incoming = normalizeProfiles(await provider.data());
					incomingTags = buildTagProfileMap(incoming, contextTag);
				}
				this.values = coalesceProfiles(this.values, incoming, order);
				this.tags = coalesceTagProfiles(this.tags, incomingTags, order);
			} catch (error) {
				const figmentError = error instanceof FigmentError ? error.withContext({
					metadata: contextMetadata,
					tag: contextTag,
					profile: this.activeProfile
				}) : FigmentError.message(error instanceof Error ? error.message : String(error));
				this.failure = this.failure ? figmentError.chain(this.failure) : figmentError;
			}
		});
		return this;
	}
	allocateTag(profile) {
		while (this.metadataByTag.has(this.nextTag)) this.nextTag += 1;
		const metadataId = this.nextTag;
		this.nextTag += 1;
		return makeTag(metadataId, profile);
	}
	importMetadataMap(map) {
		const remap = /* @__PURE__ */ new Map();
		for (const [metadataId, metadata] of map.entries()) {
			if (!this.metadataByTag.has(metadataId)) {
				this.metadataByTag.set(metadataId, metadata);
				if (metadataId >= this.nextTag) this.nextTag = metadataId + 1;
				continue;
			}
			const replacement = this.allocateTag(this.activeProfile);
			remap.set(metadataId, replacement.metadataId);
			this.metadataByTag.set(replacement.metadataId, metadata);
		}
		return remap;
	}
	async merged() {
		return (await this.mergedState()).value;
	}
	async mergedState() {
		await this.ready();
		const defaults = this.values[DEFAULT_PROFILE] ?? {};
		const globals = this.values[GLOBAL_PROFILE] ?? {};
		const selected = this.values[this.activeProfile];
		const defaultTags = this.tags[DEFAULT_PROFILE] ?? emptyTagDictNode();
		const globalTags = this.tags[GLOBAL_PROFILE] ?? emptyTagDictNode();
		const selectedTags = this.tags[this.activeProfile];
		if (selected && isCustomProfile(this.activeProfile)) return {
			value: coalesceDict(coalesceDict(defaults, selected, "merge"), globals, "merge"),
			tags: coalesceTagDictNode(coalesceTagDictNode(defaultTags, selectedTags ?? emptyTagDictNode(), "merge"), globalTags, "merge")
		};
		return {
			value: coalesceDict(defaults, globals, "merge"),
			tags: coalesceTagDictNode(defaultTags, globalTags, "merge")
		};
	}
	async findTagForPath(path) {
		return unwrapTag(findTag((await this.mergedState()).tags, path));
	}
};
function normalizeProfiles(map) {
	const out = {};
	for (const [profile, dict] of Object.entries(map)) out[normalizeProfile(profile)] = deepClone(dict);
	return out;
}
function lossyConfig(value) {
	const out = {};
	for (const [key, item] of Object.entries(value)) out[key] = lossyValue(item);
	return out;
}
function lossyValue(value) {
	if (Array.isArray(value)) return value.map((item) => lossyValue(item));
	if (isConfigDict(value)) return lossyConfig(value);
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	const lowered = trimmed.toLowerCase();
	if ([
		"true",
		"yes",
		"on",
		"1"
	].includes(lowered)) return true;
	if ([
		"false",
		"no",
		"off",
		"0"
	].includes(lowered)) return false;
	if (/^-?\d+$/.test(trimmed)) {
		const parsed = Number.parseInt(trimmed, 10);
		if (!Number.isNaN(parsed)) return parsed;
	}
	if (/^-?\d+(\.\d+)?([eE]-?\d+)?$/.test(trimmed)) {
		const parsed = Number.parseFloat(trimmed);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return value;
}
function unwrapTag(tree) {
	return tree?.tag;
}
function emptyTagDictNode() {
	return {
		kind: "dict",
		tag: makeTag(0, DEFAULT_PROFILE),
		children: []
	};
}
function captureProvideLocation() {
	const stack = (/* @__PURE__ */ new Error()).stack;
	if (!stack) return;
	const lines = stack.split("\n").slice(1).map((line) => line.trim());
	for (const line of lines) {
		if (line.includes("captureProvideLocation") || line.includes("/src/figment.ts")) continue;
		return line.replace(/^at\s+/, "");
	}
}

//#endregion
//#region src/providers/env.ts
var Env = class Env {
	transforms;
	profileName;
	prefixValue;
	shouldLowercase;
	constructor(transforms = []) {
		this.transforms = transforms;
		this.profileName = DEFAULT_PROFILE;
		this.shouldLowercase = true;
	}
	static raw() {
		return new Env();
	}
	static prefixed(prefix) {
		const lowered = prefix.toLowerCase();
		const env = new Env([(key) => {
			if (!key.toLowerCase().startsWith(lowered)) return;
			return key.slice(prefix.length);
		}]);
		env.prefixValue = prefix;
		return env;
	}
	filter(predicate) {
		return this.withTransform((key) => predicate(key) ? key : void 0);
	}
	map(mapper) {
		return this.withTransform((key) => mapper(key));
	}
	filterMap(mapper) {
		return this.withTransform(mapper);
	}
	lowercase(lowercase) {
		const copy = this.clone();
		copy.shouldLowercase = lowercase;
		return copy;
	}
	split(pattern) {
		return this.map((key) => key.replaceAll(pattern, "."));
	}
	ignore(keys) {
		const set = new Set(keys.map((key) => key.toLowerCase()));
		return this.filter((key) => !set.has(key.toLowerCase()));
	}
	only(keys) {
		const set = new Set(keys.map((key) => key.toLowerCase()));
		return this.filter((key) => set.has(key.toLowerCase()));
	}
	profile(profile) {
		const copy = this.clone();
		copy.profileName = normalizeProfile(profile);
		return copy;
	}
	selectedProfile() {
		return this.profileName;
	}
	global() {
		const copy = this.clone();
		copy.profileName = GLOBAL_PROFILE;
		return copy;
	}
	metadata() {
		const metadata = metadataFromEnv(this.prefixValue ? `\`${this.prefixValue.toUpperCase()}\` environment variable(s)` : "environment variable(s)", this.prefixValue ? `${this.prefixValue.toUpperCase()}*` : "*");
		metadata.interpolate = (_profile, keys) => keys.map((k) => k.toUpperCase()).join(".");
		return metadata;
	}
	data() {
		let dict = {};
		for (const [key, value] of this.iter()) {
			const nested = nest(key, parseEnvironmentValue(value));
			dict = coalesceDict(dict, nested, "merge");
		}
		return { [this.profileName]: dict };
	}
	iter(source = process.env) {
		const values = [];
		for (const [rawKey, rawValue] of Object.entries(source)) {
			if (rawValue === void 0) continue;
			let key = rawKey.trim();
			if (key.length === 0) continue;
			let rejected = false;
			for (const transform of this.transforms) {
				const next = transform(key);
				if (next === void 0) {
					rejected = true;
					break;
				}
				key = next;
			}
			if (rejected) continue;
			key = key.trim();
			if (key.length === 0) continue;
			if (this.shouldLowercase) key = key.toLowerCase();
			if (key.split(".").some((part) => part.trim().length === 0)) continue;
			values.push([key, rawValue]);
		}
		return values;
	}
	static var(name) {
		const lowered = name.toLowerCase();
		for (const [key, value] of Object.entries(process.env)) if (value !== void 0 && key.trim().toLowerCase() === lowered) return value.trim();
	}
	static varOr(name, fallback) {
		return Env.var(name) ?? fallback;
	}
	withTransform(transform) {
		return new Env([...this.transforms, transform]).copyFrom(this);
	}
	clone() {
		return new Env([...this.transforms]).copyFrom(this);
	}
	copyFrom(other) {
		this.profileName = other.profileName;
		this.prefixValue = other.prefixValue;
		this.shouldLowercase = other.shouldLowercase;
		return this;
	}
};
function parseEnvironmentValue(rawValue) {
	const source = rawValue.trim();
	if (source.length === 0) return "";
	try {
		return convertUnknown(TOML.parse(`value = ${source}`).value);
	} catch {
		return rawValue;
	}
}
function convertUnknown(value) {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	if (Array.isArray(value)) return value.map((item) => convertUnknown(item));
	if (typeof value === "object") {
		const dict = {};
		for (const [key, item] of Object.entries(value)) dict[key] = convertUnknown(item);
		return dict;
	}
	return String(value);
}

//#endregion
//#region src/providers/serialized.ts
var Serialized = class Serialized {
	value;
	keyPath;
	targetProfile;
	constructor(value, profile = DEFAULT_PROFILE, keyPath) {
		this.value = value;
		this.keyPath = keyPath;
		this.targetProfile = normalizeProfile(profile);
	}
	static from(value, profile) {
		return new Serialized(value, profile);
	}
	static defaults(value) {
		return new Serialized(value, DEFAULT_PROFILE);
	}
	static globals(value) {
		return new Serialized(value, GLOBAL_PROFILE);
	}
	static default(key, value) {
		return new Serialized(value, DEFAULT_PROFILE, key);
	}
	static global(key, value) {
		return new Serialized(value, GLOBAL_PROFILE, key);
	}
	profile(profile) {
		this.targetProfile = normalizeProfile(profile);
		return this;
	}
	selectedProfile() {
		return this.targetProfile;
	}
	key(keyPath) {
		this.keyPath = keyPath;
		return this;
	}
	metadata() {
		return metadataFromInline("Serialized", this.keyPath ? `serialized value for ${this.keyPath}` : "serialized value");
	}
	data() {
		const serialized = toConfigValue$1(this.value);
		let dict;
		if (this.keyPath) dict = nest(this.keyPath, serialized);
		else if (isConfigDict(serialized)) dict = serialized;
		else throw new Error("Serialized provider without a key path must serialize to a dictionary");
		return { [this.targetProfile]: dict };
	}
};
function toConfigValue$1(value) {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	if (Array.isArray(value)) return value.map((item) => toConfigValue$1(item));
	if (typeof value === "object") {
		const record = value;
		const dict = {};
		for (const [key, item] of Object.entries(record)) dict[key] = toConfigValue$1(item);
		return deepClone(dict);
	}
	return String(value);
}

//#endregion
//#region src/providers/data.ts
var Data = class Data {
	source;
	profileName;
	constructor(format, source, profileName = DEFAULT_PROFILE) {
		this.format = format;
		this.source = source;
		this.profileName = profileName;
	}
	static file(format, path) {
		return new Data(format, {
			type: "file",
			path,
			required: false,
			search: true
		});
	}
	static string(format, source) {
		return new Data(format, {
			type: "string",
			source
		});
	}
	nested() {
		this.profileName = void 0;
		return this;
	}
	required(required) {
		if (this.source.type === "file") this.source.required = required;
		return this;
	}
	search(search) {
		if (this.source.type === "file") this.source.search = search;
		return this;
	}
	profile(profile) {
		this.profileName = normalizeProfile(profile);
		return this;
	}
	selectedProfile() {
		return this.profileName;
	}
	metadata() {
		if (this.source.type === "string") return metadataFromInline(`${this.format.name} source string`, `${this.format.name} inline string`);
		return metadataFromFile(`${this.format.name} file`, this.source.path);
	}
	async data() {
		const value = await this.load();
		if (this.profileName) {
			if (!isConfigDict(value)) throw new Error(`${this.format.name} source must decode to a dictionary when nesting is disabled`);
			return { [this.profileName]: value };
		}
		if (!isConfigDict(value)) throw new Error(`${this.format.name} nested source must decode to a profile dictionary`);
		const output = {};
		for (const [profile, profileValue] of Object.entries(value)) if (isConfigDict(profileValue)) output[normalizeProfile(profile)] = profileValue;
		return output;
	}
	async load() {
		if (this.source.type === "string") return toConfigValue(this.format.parse(this.source.source));
		const path = await resolvePath(this.source.path, this.source.search);
		if (!path) {
			if (!this.source.required) return {};
			throw new Error(`required file '${this.source.path}' not found`);
		}
		const source = await readFile(path, "utf8");
		return toConfigValue(this.format.parse(source));
	}
};
const Json = createFormatProvider({
	name: "JSON",
	parse: (source) => JSON.parse(source)
});
const Toml = createFormatProvider({
	name: "TOML",
	parse: (source) => TOML.parse(source)
});
const Yaml = createFormatProvider({
	name: "YAML",
	parse: (source) => YAML.parse(source)
});
function createFormatProvider(format) {
	return {
		file(path) {
			return Data.file(format, path);
		},
		string(source) {
			return Data.string(format, source);
		}
	};
}
async function resolvePath(path, search) {
	const resolvedIfAbsolute = isAbsolute(path) ? path : void 0;
	if (resolvedIfAbsolute) return await exists(resolvedIfAbsolute) ? resolvedIfAbsolute : void 0;
	if (!search) {
		const exact = resolve(process.cwd(), path);
		return await exists(exact) ? exact : void 0;
	}
	let current = process.cwd();
	while (true) {
		const candidate = resolve(current, path);
		if (await exists(candidate)) return candidate;
		const parent = dirname(current);
		if (parent === current) return;
		current = parent;
	}
}
async function exists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
function toConfigValue(value) {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	if (Array.isArray(value)) return value.map((item) => toConfigValue(item));
	if (typeof value === "object") {
		const dict = {};
		for (const [key, item] of Object.entries(value)) dict[key] = toConfigValue(item);
		return dict;
	}
	return String(value);
}

//#endregion
//#region src/providers/index.ts
var providers_exports = /* @__PURE__ */ __exportAll({
	Data: () => Data,
	Env: () => Env,
	Json: () => Json,
	Serialized: () => Serialized,
	Toml: () => Toml,
	Yaml: () => Yaml
});

//#endregion
export { DEFAULT_PROFILE, Figment, FigmentError, GLOBAL_PROFILE, profileFromEnv, profileFromEnvOr, providers_exports as providers };