//#region src/materials/core/alpha-policy.ts
/** Resolves renderer-neutral MMD alpha intent into one concrete render mode. */
const resolveMMDAlphaPolicy = (input) => {
	if (input.mode !== "evaluate") return input.mode;
	if ((input.alphaTest ?? 0) > 0) return "cutout";
	if (input.opacity < 1) return "blend";
	if (input.textureAlphaMode !== void 0) return input.textureAlphaMode;
	if (input.textureHasTransparency) return "blend";
	return "opaque";
};
/**
* Classifies sampled texture alpha using Babylon-MMD's alpha evaluation rule.
* The input values use the usual texture-alpha range (0 = transparent,
* 255 = opaque); Babylon's checker evaluates the inverted value in its pass.
*/
const resolveMMDTextureAlphaMode = (alphaValues, alphaThreshold = 195, alphaBlendThreshold = 100) => {
	let maxInvertedAlpha = 0;
	let middleInvertedAlphaSum = 0;
	let middleInvertedAlphaCount = 0;
	for (const alpha of alphaValues) {
		const invertedAlpha = 255 - alpha;
		maxInvertedAlpha = Math.max(maxInvertedAlpha, invertedAlpha);
		if (invertedAlpha > 0 && invertedAlpha < 255) {
			middleInvertedAlphaSum += invertedAlpha;
			middleInvertedAlphaCount++;
		}
	}
	if (maxInvertedAlpha < alphaThreshold) return void 0;
	return (middleInvertedAlphaCount === 0 ? 0 : middleInvertedAlphaSum / middleInvertedAlphaCount) + alphaBlendThreshold < maxInvertedAlpha ? "cutout" : "blend";
};
/** Applies one resolved policy to Three's alpha/depth material controls. */
const applyMMDAlphaPolicy = (material, mode, alphaTest = .5) => {
	material.alphaTest = mode === "cutout" ? alphaTest : 0;
	material.transparent = mode === "blend" || mode === "mmd-depth-blend";
	material.depthWrite = mode !== "blend";
};
//#endregion
export { resolveMMDAlphaPolicy as n, resolveMMDTextureAlphaMode as r, applyMMDAlphaPolicy as t };
