//#region src/materials/types.ts
const isMMDMaterial = (material) => "isMMDMaterial" in material && material.isMMDMaterial === true && "applyMMDMaterialState" in material && typeof material.applyMMDMaterialState === "function" && "setMMDAlphaMorphEnabled" in material && typeof material.setMMDAlphaMorphEnabled === "function" && "setMMDTextureAlphaMode" in material && typeof material.setMMDTextureAlphaMode === "function" && "setSdefEnabled" in material && typeof material.setSdefEnabled === "function";
//#endregion
export { isMMDMaterial as t };
