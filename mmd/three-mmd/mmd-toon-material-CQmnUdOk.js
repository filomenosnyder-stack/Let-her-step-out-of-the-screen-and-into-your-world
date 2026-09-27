import { t as installSdefPatch } from "./sdef-Bag401Db.js";
import { n as resolveMMDAlphaPolicy, t as applyMMDAlphaPolicy } from "./alpha-policy-aafr_Rse.js";
import { CustomBlending, DoubleSide, DstAlphaFactor, FrontSide, MeshPhongMaterial, OneMinusSrcAlphaFactor, REVISION, SrcAlphaFactor, Vector4 } from "three";
//#region src/materials/toon/mmd-toon-material.ts
const capabilities = {
	alpha: [
		"opaque",
		"cutout",
		"mmd-depth-blend"
	],
	materialMorph: "binding",
	outline: false,
	renderer: ["webgl-renderer"],
	sdef: "full",
	sphereTexture: ["multiply", "add"],
	toon: true
};
const replaceShaderSeam = (source, expected, replacement, name) => {
	if (!source.includes(expected)) throw new Error(`MMDToonMaterial shader patch failed: missing ${name} (Three r${REVISION}).`);
	return source.replace(expected, replacement);
};
const fragmentPreamble = `
uniform vec3 mmdAmbient;
uniform sampler2D mmdSphereMap;
uniform sampler2D mmdToonMap;
uniform vec4 mmdTextureMultiplicativeColor;
uniform vec4 mmdTextureAdditiveColor;
uniform vec4 mmdSphereTextureMultiplicativeColor;
uniform vec4 mmdSphereTextureAdditiveColor;
uniform vec4 mmdToonTextureMultiplicativeColor;
uniform vec4 mmdToonTextureAdditiveColor;
uniform float mmdSphereBlendMode;

vec3 mmdApplyTextureColor( vec3 value, vec4 multiplicativeColor, vec4 additiveColor ) {
  value = mix( vec3( 1.0 ), value * multiplicativeColor.rgb, multiplicativeColor.a );
  return clamp( value + ( value - vec3( 1.0 ) ) * additiveColor.a, 0.0, 1.0 ) + additiveColor.rgb;
}
`;
const mapFragment = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  sampledDiffuseColor.rgb = mmdApplyTextureColor( sampledDiffuseColor.rgb, mmdTextureMultiplicativeColor, mmdTextureAdditiveColor );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
const phongPars = `
varying vec3 vViewPosition;

struct BlinnPhongMaterial {
  vec3 diffuseColor;
  vec3 specularColor;
  float specularShininess;
  float specularStrength;
};

void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = dot( geometryNormal, directLight.direction );
  vec3 toon = texture2D( mmdToonMap, vec2( clamp( dotNL * 0.5 + 0.5, 0.0, 1.0 ), 0.0 ) ).rgb;
  toon = mmdApplyTextureColor( toon, mmdToonTextureMultiplicativeColor, mmdToonTextureAdditiveColor );
  vec3 irradiance = toon * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
  reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}

void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}

#define RE_Direct RE_Direct_BlinnPhong
#define RE_IndirectDiffuse RE_IndirectDiffuse_BlinnPhong
`;
const phongMaterial = `
BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;
`;
const emissiveRadiance = `
vec3 totalEmissiveRadiance = emissive + mmdAmbient * 0.2;
`;
const outgoingLight = `
vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;

#if MMD_SPHERE_BLEND_MODE > 0
vec2 mmdSphereUv = normal.xy * 0.5 + 0.5;
vec3 mmdSphere = texture2D( mmdSphereMap, mmdSphereUv ).rgb;
mmdSphere = mmdApplyTextureColor( mmdSphere, mmdSphereTextureMultiplicativeColor, mmdSphereTextureAdditiveColor );
mmdSphere *= reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
#if MMD_SPHERE_BLEND_MODE > 1
outgoingLight += mmdSphere;
#else
outgoingLight *= mmdSphere;
#endif
#endif
`;
const uniform = (value) => ({ value });
const createPhongParameters = (descriptor) => ({
	...descriptor.alphaTest === void 0 ? {} : { alphaTest: descriptor.alphaTest },
	blendDst: OneMinusSrcAlphaFactor,
	blendDstAlpha: DstAlphaFactor,
	blending: CustomBlending,
	blendSrc: SrcAlphaFactor,
	blendSrcAlpha: SrcAlphaFactor,
	...descriptor.map === void 0 ? {} : { map: descriptor.map },
	color: descriptor.diffuse,
	fog: descriptor.fog,
	opacity: descriptor.opacity,
	shininess: descriptor.shininess,
	side: descriptor.opacity !== 1 || descriptor.doubleSided ? DoubleSide : FrontSide,
	specular: descriptor.specular,
	transparent: descriptor.opacity !== 1
});
/**
* Three's native Phong material with MMD toon/sphere semantics layered through
* guarded WebGL shader seams. It intentionally has no ShaderMaterial aliases
* such as `gradientMap` and `matcap`.
*/
var MMDToonMaterial = class extends MeshPhongMaterial {
	static isMMDMaterial = true;
	static mmdCapabilities = capabilities;
	ambient;
	descriptor;
	isMMDMaterial = true;
	isMMDToonMaterial = true;
	mmdCapabilities = capabilities;
	sphereBlendMode;
	sphereMap;
	sphereTextureAdditiveColor = new Vector4(0, 0, 0, 0);
	sphereTextureMultiplicativeColor = new Vector4(1, 1, 1, 1);
	textureAdditiveColor = new Vector4(0, 0, 0, 0);
	textureMultiplicativeColor = new Vector4(1, 1, 1, 1);
	toonMap;
	toonTextureAdditiveColor = new Vector4(0, 0, 0, 0);
	toonTextureMultiplicativeColor = new Vector4(1, 1, 1, 1);
	alphaMorphEnabled = false;
	mmdUniforms;
	textureAlphaMode;
	constructor(descriptor) {
		super(createPhongParameters(descriptor));
		if (descriptor.toonMap === void 0) throw new TypeError("MMDToonMaterial requires a resolved toon map.");
		this.descriptor = descriptor;
		this.name = descriptor.name;
		this.ambient = descriptor.ambient.clone();
		this.sphereBlendMode = descriptor.sphereBlendMode;
		this.sphereMap = descriptor.sphereMap;
		this.toonMap = descriptor.toonMap;
		this.emissive.setRGB(0, 0, 0);
		this.textureAlphaMode = descriptor.textureAlphaMode;
		this.updateAlphaPolicy(this.opacity);
		this.defines = {
			...this.defines,
			MMD_SPHERE_BLEND_MODE: this.getSphereBlendModeValue(),
			MMD_USE_SDEF: 1
		};
		this.mmdUniforms = {
			mmdAmbient: uniform(this.ambient),
			mmdSphereBlendMode: uniform(this.getSphereBlendModeValue()),
			mmdSphereMap: uniform(this.sphereMap ?? this.toonMap),
			mmdSphereTextureAdditiveColor: uniform(this.sphereTextureAdditiveColor),
			mmdSphereTextureMultiplicativeColor: uniform(this.sphereTextureMultiplicativeColor),
			mmdTextureAdditiveColor: uniform(this.textureAdditiveColor),
			mmdTextureMultiplicativeColor: uniform(this.textureMultiplicativeColor),
			mmdToonMap: uniform(this.toonMap),
			mmdToonTextureAdditiveColor: uniform(this.toonTextureAdditiveColor),
			mmdToonTextureMultiplicativeColor: uniform(this.toonTextureMultiplicativeColor)
		};
		installSdefPatch(this);
		const previous = this.onBeforeCompile;
		this.onBeforeCompile = (shader, renderer) => {
			previous?.(shader, renderer);
			Object.assign(shader.uniforms, this.mmdUniforms);
			shader.fragmentShader = replaceShaderSeam(shader.fragmentShader, "#include <common>", `#include <common>\n${fragmentPreamble}`, "common");
			shader.fragmentShader = replaceShaderSeam(shader.fragmentShader, "#include <map_fragment>", mapFragment, "map_fragment");
			shader.fragmentShader = replaceShaderSeam(shader.fragmentShader, "#include <lights_phong_pars_fragment>", phongPars, "lights_phong_pars_fragment");
			shader.fragmentShader = replaceShaderSeam(shader.fragmentShader, "#include <lights_phong_fragment>", phongMaterial, "lights_phong_fragment");
			shader.fragmentShader = replaceShaderSeam(shader.fragmentShader, "vec3 totalEmissiveRadiance = emissive;", emissiveRadiance, "totalEmissiveRadiance");
			shader.fragmentShader = replaceShaderSeam(shader.fragmentShader, "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;", outgoingLight, "outgoingLight");
			shader.fragmentShader = replaceShaderSeam(shader.fragmentShader, "#include <lights_fragment_maps>", "", "lights_fragment_maps");
			shader.fragmentShader = replaceShaderSeam(shader.fragmentShader, "#include <envmap_fragment>", "", "envmap_fragment");
		};
	}
	applyMMDMaterialState(state) {
		this.color.copy(state.diffuse);
		this.specular.copy(state.specular);
		this.ambient.copy(state.ambient);
		this.opacity = state.opacity;
		this.shininess = state.shininess;
		this.textureMultiplicativeColor.copy(state.textureMultiplicativeColor);
		this.textureAdditiveColor.copy(state.textureAdditiveColor);
		this.sphereTextureMultiplicativeColor.copy(state.sphereTextureMultiplicativeColor);
		this.sphereTextureAdditiveColor.copy(state.sphereTextureAdditiveColor);
		this.toonTextureMultiplicativeColor.copy(state.toonTextureMultiplicativeColor);
		this.toonTextureAdditiveColor.copy(state.toonTextureAdditiveColor);
		this.updateAlphaPolicy(state.opacity);
	}
	clone() {
		const Constructor = this.constructor;
		return new Constructor(this.descriptor).copy(this);
	}
	copy(source) {
		super.copy(source);
		this.defines = { ...source.defines };
		this.needsUpdate = true;
		this.descriptor = source.descriptor;
		this.ambient.copy(source.ambient);
		this.sphereBlendMode = source.sphereBlendMode;
		this.sphereMap = source.sphereMap;
		this.toonMap = source.toonMap;
		this.textureMultiplicativeColor.copy(source.textureMultiplicativeColor);
		this.textureAdditiveColor.copy(source.textureAdditiveColor);
		this.sphereTextureMultiplicativeColor.copy(source.sphereTextureMultiplicativeColor);
		this.sphereTextureAdditiveColor.copy(source.sphereTextureAdditiveColor);
		this.toonTextureMultiplicativeColor.copy(source.toonTextureMultiplicativeColor);
		this.toonTextureAdditiveColor.copy(source.toonTextureAdditiveColor);
		this.alphaMorphEnabled = source.alphaMorphEnabled;
		this.textureAlphaMode = source.textureAlphaMode;
		this.mmdUniforms.mmdSphereMap.value = this.sphereMap ?? this.toonMap;
		this.mmdUniforms.mmdToonMap.value = this.toonMap;
		this.mmdUniforms.mmdSphereBlendMode.value = this.getSphereBlendModeValue();
		this.updateAlphaPolicy(this.opacity);
		return this;
	}
	customProgramCacheKey() {
		return `${super.customProgramCacheKey()}|mmd-toon|${this.sphereBlendMode ?? "none"}|${this.sphereMap === void 0 ? "no-sphere" : "sphere"}|sdef:${String(this.defines?.MMD_USE_SDEF ?? 1)}`;
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
	getSphereBlendModeValue() {
		if (this.sphereMap === void 0 || this.sphereBlendMode === void 0) return 0;
		return this.sphereBlendMode === "add" ? 2 : 1;
	}
	updateAlphaPolicy(opacity, textureAlphaMode = this.textureAlphaMode) {
		const evaluatedMode = resolveMMDAlphaPolicy({
			alphaTest: this.descriptor.alphaTest,
			mode: "evaluate",
			opacity,
			textureAlphaMode,
			textureHasTransparency: textureAlphaMode !== void 0 || this.alphaMorphEnabled
		});
		applyMMDAlphaPolicy(this, evaluatedMode === "blend" ? "mmd-depth-blend" : evaluatedMode, this.descriptor.alphaTest ?? .5);
	}
};
//#endregion
export { MMDToonMaterial as t };
