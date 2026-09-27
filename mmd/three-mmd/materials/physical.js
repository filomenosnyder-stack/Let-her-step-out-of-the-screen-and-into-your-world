import { t as installSdefPatch } from "../sdef-Bag401Db.js";
import { n as resolveMMDAlphaPolicy, t as applyMMDAlphaPolicy } from "../alpha-policy-aafr_Rse.js";
import { DoubleSide, FrontSide, MeshPhysicalMaterial } from "three";
//#region src/materials/physical/mapping.ts
/** Precision boundary of the WebGL Physical baseline. */
const MMD_PHYSICAL_MATERIAL_MAPPING = {
	ambient: "unsupported",
	diffuse: "exact",
	diffuseTexture: "exact",
	doubleSided: "exact",
	metalness: "unsupported",
	opacity: "approximate",
	outline: "unsupported",
	shininess: "approximate",
	specular: "approximate",
	sphereTexture: "unsupported",
	textureMorphColor: "unsupported",
	toonTexture: "unsupported"
};
/** Maps PMX specular into the optional Physical non-metal F0 approximation. */
const resolveMMDPhysicalSpecularColor = (specular, mode) => mode === "physical-color" ? specular.clone() : void 0;
/**
* Engineering approximation from a Blinn-Phong exponent to Three's GGX
* roughness input. This is intentionally replaceable rather than a PMX rule.
*/
const mmdShininessToRoughness = (shininess) => Math.sqrt(2 / (Math.max(0, shininess) + 2));
const resolveMMDPhysicalRoughness = (shininess, mapping = mmdShininessToRoughness) => Math.min(1, Math.max(0, mapping(shininess)));
//#endregion
//#region src/materials/physical/mmd-physical-material.ts
const capabilities = {
	alpha: [
		"opaque",
		"cutout",
		"blend",
		"mmd-depth-blend"
	],
	materialMorph: "binding",
	outline: false,
	renderer: ["webgl-renderer"],
	sdef: "full",
	sphereTexture: [],
	toon: false
};
const resolveOptions = (options) => ({
	alphaMode: options.alphaMode ?? "evaluate",
	shininessToRoughness: options.shininessToRoughness ?? mmdShininessToRoughness,
	specularMode: options.specularMode ?? "ignore"
});
const createPhysicalParameters = (descriptor, options) => {
	const specularColor = resolveMMDPhysicalSpecularColor(descriptor.specular, options.specularMode);
	return {
		...descriptor.alphaTest === void 0 ? {} : { alphaTest: descriptor.alphaTest },
		...descriptor.map === void 0 ? {} : { map: descriptor.map },
		color: descriptor.diffuse,
		fog: descriptor.fog,
		metalness: 0,
		opacity: descriptor.opacity,
		roughness: resolveMMDPhysicalRoughness(descriptor.shininess, options.shininessToRoughness),
		...specularColor === void 0 ? {} : { specularColor },
		side: descriptor.doubleSided ? DoubleSide : FrontSide,
		transparent: descriptor.opacity !== 1
	};
};
/**
* @experimental
* Opt-in physically based MMD material backend for WebGLRenderer.
*/
var MMDPhysicalMaterial = class extends MeshPhysicalMaterial {
	static isMMDMaterial = true;
	static mmdCapabilities = capabilities;
	alphaMode;
	descriptor;
	isMMDMaterial = true;
	mmdCapabilities = capabilities;
	shininessToRoughness;
	specularMode;
	alphaMorphEnabled = false;
	textureAlphaMode;
	constructor(descriptor, options = {}) {
		const resolvedOptions = resolveOptions(options);
		super(createPhysicalParameters(descriptor, resolvedOptions));
		this.descriptor = descriptor;
		this.alphaMode = resolvedOptions.alphaMode;
		this.shininessToRoughness = resolvedOptions.shininessToRoughness;
		this.specularMode = resolvedOptions.specularMode;
		this.name = descriptor.name;
		this.textureAlphaMode = descriptor.textureAlphaMode;
		this.updateAlphaPolicy(descriptor.opacity);
		installSdefPatch(this);
	}
	applyMMDMaterialState(state) {
		this.color.copy(state.diffuse);
		this.opacity = state.opacity;
		this.roughness = resolveMMDPhysicalRoughness(state.shininess, this.shininessToRoughness);
		const specularColor = resolveMMDPhysicalSpecularColor(state.specular, this.specularMode);
		if (specularColor !== void 0) this.specularColor.copy(specularColor);
		this.updateAlphaPolicy(state.opacity);
	}
	clone() {
		const Constructor = this.constructor;
		return new Constructor(this.descriptor, {
			alphaMode: this.alphaMode,
			shininessToRoughness: this.shininessToRoughness,
			specularMode: this.specularMode
		}).copy(this);
	}
	copy(source) {
		super.copy(source);
		this.defines = { ...source.defines };
		this.needsUpdate = true;
		this.descriptor = source.descriptor;
		this.alphaMode = source.alphaMode;
		this.shininessToRoughness = source.shininessToRoughness;
		this.specularMode = source.specularMode;
		this.alphaMorphEnabled = source.alphaMorphEnabled;
		this.textureAlphaMode = source.textureAlphaMode;
		this.updateAlphaPolicy(this.opacity);
		return this;
	}
	customProgramCacheKey() {
		return `${super.customProgramCacheKey()}|mmd-physical|sdef:${String(this.defines?.MMD_USE_SDEF ?? 1)}`;
	}
	setMMDAlphaMorphEnabled(enabled) {
		this.alphaMorphEnabled = enabled;
		this.updateAlphaPolicy(this.opacity);
	}
	setMMDTextureAlphaMode(mode) {
		this.textureAlphaMode = mode;
		this.updateAlphaPolicy(this.opacity, mode);
	}
	setSdefEnabled(enabled) {
		const value = enabled ? 1 : 0;
		if (this.defines?.MMD_USE_SDEF === value) return;
		this.defines = {
			...this.defines,
			MMD_USE_SDEF: value
		};
		this.needsUpdate = true;
	}
	updateAlphaPolicy(opacity, textureAlphaMode = this.textureAlphaMode) {
		const mode = resolveMMDAlphaPolicy({
			alphaTest: this.descriptor.alphaTest,
			mode: this.alphaMode,
			opacity,
			textureAlphaMode,
			textureHasTransparency: textureAlphaMode !== void 0 || this.alphaMorphEnabled
		});
		const evaluatedTextureCutout = mode === "cutout" && textureAlphaMode === "cutout" && (this.descriptor.alphaTest ?? 0) <= 0;
		const renderMode = this.alphaMode === "evaluate" && (mode === "blend" || evaluatedTextureCutout) ? "mmd-depth-blend" : mode;
		applyMMDAlphaPolicy(this, renderMode, this.descriptor.alphaTest ?? .5);
	}
};
//#endregion
export { MMDPhysicalMaterial, MMD_PHYSICAL_MATERIAL_MAPPING, mmdShininessToRoughness, resolveMMDPhysicalRoughness, resolveMMDPhysicalSpecularColor };
