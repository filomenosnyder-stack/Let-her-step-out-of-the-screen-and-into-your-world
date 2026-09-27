import { t as isMMDMaterial } from "./types-B_z4NFJ3.js";
import { t as installSdefPatch } from "./sdef-Bag401Db.js";
import { r as resolveMMDTextureAlphaMode } from "./alpha-policy-aafr_Rse.js";
import { t as MMDToonMaterial } from "./mmd-toon-material-CQmnUdOk.js";
import { AnimationClip, AnimationMixer, Bone, BufferAttribute, BufferGeometry, Color, DefaultLoadingManager, Euler, FileLoader, Interpolant, Line, LineBasicMaterial, Loader, LoaderUtils, Matrix4, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshDistanceMaterial, NearestFilter, NumberKeyframeTrack, Object3D, Quaternion, QuaternionKeyframeTrack, RGBADepthPacking, RGB_ETC1_Format, RGB_ETC2_Format, RGB_PVRTC_2BPPV1_Format, RGB_PVRTC_4BPPV1_Format, RGB_S3TC_DXT1_Format, RepeatWrapping, SRGBColorSpace, Skeleton, SkinnedMesh, SphereGeometry, Texture, TextureLoader, Vector3, VectorKeyframeTrack } from "three";
import { TGALoader } from "three/addons/loaders/TGALoader.js";
//#region src/loaders/loader-plugin.ts
const isFirstPartyMaterial = (materialType) => materialType.isMMDMaterial === true;
/** Selects the first-party MMD material backend before mesh assembly begins. */
var MMDMaterialPlugin = class {
	materialType;
	name = "MMDMaterialPlugin";
	constructor(_parser, options) {
		if (!isFirstPartyMaterial(options.materialType)) throw new TypeError("MMDMaterialPlugin: materialType must be an MMD material backend.");
		this.materialType = options.materialType;
	}
};
const createPhysicsPlugin = (name, createPhysics) => () => ({
	afterBuild: (mmd) => mmd.setPhysics(createPhysics),
	name
});
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/Parser/ILogger.js
/**
* A logger that outputs to the console
*
* generally, you can use this class as default logger
*/
var ConsoleLogger = class {
	log(message) {
		console.log(message);
	}
	warn(message) {
		console.warn(message);
	}
	error(message) {
		console.error(message);
	}
};
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/Parser/endianness.js
/**
* Endianness utility class for serlization/deserialization
*/
var Endianness = class {
	/**
	* Whether the device is little endian
	*/
	isDeviceLittleEndian;
	constructor() {
		this.isDeviceLittleEndian = this._getIsDeviceLittleEndian();
	}
	_getIsDeviceLittleEndian() {
		const array = new Int16Array([256]);
		return new Int8Array(array.buffer)[1] === 1;
	}
	/**
	* Changes the byte order of the array
	* @param array Array to swap
	*/
	swap16Array(array, offset = 0, length = array.length) {
		for (let i = offset; i < length; ++i) {
			const value = array[i];
			array[i] = (value & 255) << 8 | value >> 8 & 255;
		}
	}
	/**
	* Changes the byte order of the array
	* @param array Array to swap
	*/
	swap32Array(array, offset = 0, length = array.length) {
		for (let i = offset; i < length; ++i) {
			const value = array[i];
			array[i] = (value & 255) << 24 | (value & 65280) << 8 | value >> 8 & 65280 | value >> 24 & 255;
		}
	}
};
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/Parser/mmdDataDeserializer.js
/**
* DataView wrapper for deserializing MMD data
*/
var MmdDataDeserializer = class extends Endianness {
	_dataView;
	_decoder;
	_offset;
	/**
	* Creates MMD data deserializer
	* @param arrayBuffer ArrayBuffer to deserialize
	*/
	constructor(arrayBuffer) {
		super();
		this._dataView = new DataView(arrayBuffer);
		this._decoder = null;
		this._offset = 0;
	}
	/**
	* Current offset in the buffer
	*/
	get offset() {
		return this._offset;
	}
	set offset(value) {
		this._offset = value;
	}
	/**
	* Read a uint8 value
	* @returns Uint8 value
	*/
	getUint8() {
		const value = this._dataView.getUint8(this._offset);
		this._offset += 1;
		return value;
	}
	/**
	* Read a int8 value
	* @returns Int8 value
	*/
	getInt8() {
		const value = this._dataView.getInt8(this._offset);
		this._offset += 1;
		return value;
	}
	/**
	* Read a uint16 value
	* @returns Uint16 value
	*/
	getUint16() {
		const value = this._dataView.getUint16(this._offset, true);
		this._offset += 2;
		return value;
	}
	/**
	* Read a uint16 array
	* @param dest Destination array
	*/
	getUint16Array(dest) {
		const source = new Uint8Array(this._dataView.buffer, this._offset, dest.byteLength);
		new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength).set(source);
		this._offset += dest.byteLength;
		if (!this.isDeviceLittleEndian) this.swap16Array(dest);
	}
	/**
	* Read a int16 value
	* @returns Int16 value
	*/
	getInt16() {
		const value = this._dataView.getInt16(this._offset, true);
		this._offset += 2;
		return value;
	}
	/**
	* Read a uint32 value
	* @returns Uint32 value
	*/
	getUint32() {
		const value = this._dataView.getUint32(this._offset, true);
		this._offset += 4;
		return value;
	}
	/**
	* Read a int32 value
	* @returns Int32 value
	*/
	getInt32() {
		const value = this._dataView.getInt32(this._offset, true);
		this._offset += 4;
		return value;
	}
	/**
	* Read a float32 value
	* @returns Float32 value
	*/
	getFloat32() {
		const value = this._dataView.getFloat32(this._offset, true);
		this._offset += 4;
		return value;
	}
	/**
	* Read a float32 tuple
	* @param length Tuple length
	* @returns Float32 tuple
	*/
	getFloat32Tuple(length) {
		const result = new Array(length);
		for (let i = 0; i < length; ++i) {
			result[i] = this._dataView.getFloat32(this._offset, true);
			this._offset += 4;
		}
		return result;
	}
	/**
	* Initializes TextDecoder with the specified encoding
	* @param encoding Encoding
	*/
	initializeTextDecoder(encoding) {
		this._decoder = new TextDecoder(encoding);
	}
	/**
	* Decode the string in the encoding determined by the initializeTextDecoder method
	* @param length Length of the string in bytes
	* @param trim Whether to trim the string, usally used in Shift-JIS encoding
	* @returns Decoded string
	*/
	getDecoderString(length, trim) {
		if (this._decoder === null) throw new Error("TextDecoder is not initialized.");
		let bytes = new Uint8Array(this._dataView.buffer, this._offset, length);
		this._offset += length;
		if (trim) {
			for (let i = 0; i < bytes.length; ++i) if (bytes[i] === 0) {
				bytes = bytes.subarray(0, i);
				break;
			}
		}
		return this._decoder.decode(bytes);
	}
	/**
	* Read a utf-8 string
	* @param length Length of the string in bytes
	* @returns Utf-8 string
	*/
	getSignatureString(length) {
		const decoder = new TextDecoder("utf-8");
		const bytes = new Uint8Array(this._dataView.buffer, this._offset, length);
		this._offset += length;
		return decoder.decode(bytes);
	}
	/**
	* The number of bytes available
	*/
	get bytesAvailable() {
		return this._dataView.byteLength - this._offset;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/Parser/pmdObject.js
/**
* Pmd object for temporal use in pmd parser
* @internal
*/
var PmdObject;
(function(PmdObject) {
	(function(Bone) {
		(function(Type) {
			Type[Type["Rotate"] = 0] = "Rotate";
			Type[Type["RotateMove"] = 1] = "RotateMove";
			Type[Type["Ik"] = 2] = "Ik";
			Type[Type["Unknown"] = 3] = "Unknown";
			Type[Type["IkLink"] = 4] = "IkLink";
			Type[Type["RotateEffect"] = 5] = "RotateEffect";
			Type[Type["IkTo"] = 6] = "IkTo";
			Type[Type["Invisible"] = 7] = "Invisible";
			Type[Type["Twist"] = 8] = "Twist";
			Type[Type["RotateRatio"] = 9] = "RotateRatio";
		})(Bone.Type || (Bone.Type = {}));
	})(PmdObject.Bone || (PmdObject.Bone = {}));
})(PmdObject || (PmdObject = {}));
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/Parser/pmxObject.js
var PmxObject;
(function(PmxObject) {
	(function(Header) {
		(function(Encoding) {
			Encoding[Encoding["Utf16le"] = 0] = "Utf16le";
			Encoding[Encoding["Utf8"] = 1] = "Utf8";
			Encoding[Encoding["ShiftJis"] = 2] = "ShiftJis";
		})(Header.Encoding || (Header.Encoding = {}));
	})(PmxObject.Header || (PmxObject.Header = {}));
	(function(Vertex) {
		(function(BoneWeightType) {
			BoneWeightType[BoneWeightType["Bdef1"] = 0] = "Bdef1";
			BoneWeightType[BoneWeightType["Bdef2"] = 1] = "Bdef2";
			BoneWeightType[BoneWeightType["Bdef4"] = 2] = "Bdef4";
			BoneWeightType[BoneWeightType["Sdef"] = 3] = "Sdef";
			BoneWeightType[BoneWeightType["Qdef"] = 4] = "Qdef";
		})(Vertex.BoneWeightType || (Vertex.BoneWeightType = {}));
	})(PmxObject.Vertex || (PmxObject.Vertex = {}));
	(function(Material) {
		(function(Flag) {
			Flag[Flag["IsDoubleSided"] = 1] = "IsDoubleSided";
			Flag[Flag["EnabledGroundShadow"] = 2] = "EnabledGroundShadow";
			Flag[Flag["EnabledDrawShadow"] = 4] = "EnabledDrawShadow";
			Flag[Flag["EnabledReceiveShadow"] = 8] = "EnabledReceiveShadow";
			Flag[Flag["EnabledToonEdge"] = 16] = "EnabledToonEdge";
			Flag[Flag["EnabledVertexColor"] = 32] = "EnabledVertexColor";
			Flag[Flag["EnabledPointDraw"] = 64] = "EnabledPointDraw";
			Flag[Flag["EnabledLineDraw"] = 128] = "EnabledLineDraw";
		})(Material.Flag || (Material.Flag = {}));
		(function(SphereTextureMode) {
			SphereTextureMode[SphereTextureMode["Off"] = 0] = "Off";
			SphereTextureMode[SphereTextureMode["Multiply"] = 1] = "Multiply";
			SphereTextureMode[SphereTextureMode["Add"] = 2] = "Add";
			SphereTextureMode[SphereTextureMode["SubTexture"] = 3] = "SubTexture";
		})(Material.SphereTextureMode || (Material.SphereTextureMode = {}));
	})(PmxObject.Material || (PmxObject.Material = {}));
	(function(Bone) {
		(function(Flag) {
			Flag[Flag["UseBoneIndexAsTailPosition"] = 1] = "UseBoneIndexAsTailPosition";
			Flag[Flag["IsRotatable"] = 2] = "IsRotatable";
			Flag[Flag["IsMovable"] = 4] = "IsMovable";
			Flag[Flag["IsVisible"] = 8] = "IsVisible";
			Flag[Flag["IsControllable"] = 16] = "IsControllable";
			Flag[Flag["IsIkEnabled"] = 32] = "IsIkEnabled";
			/**
			* Whether to apply Append transform in a chain
			*
			* If this bit is 0, then in a bone structure with chain-append transform applied
			*
			* the append transform works by adding itself to each other's calculation results
			*/
			Flag[Flag["LocalAppendTransform"] = 128] = "LocalAppendTransform";
			/**
			* Whether to apply Append transform to rotation
			*/
			Flag[Flag["HasAppendRotate"] = 256] = "HasAppendRotate";
			/**
			* Whether to apply Append transform to position
			*/
			Flag[Flag["HasAppendMove"] = 512] = "HasAppendMove";
			Flag[Flag["HasAxisLimit"] = 1024] = "HasAxisLimit";
			Flag[Flag["HasLocalVector"] = 2048] = "HasLocalVector";
			/**
			* Whether to apply transform after physics
			*
			* If this bit is 1, the bone transform is applied after physics
			*/
			Flag[Flag["TransformAfterPhysics"] = 4096] = "TransformAfterPhysics";
			Flag[Flag["IsExternalParentTransformed"] = 8192] = "IsExternalParentTransformed";
		})(Bone.Flag || (Bone.Flag = {}));
	})(PmxObject.Bone || (PmxObject.Bone = {}));
	(function(Morph) {
		(function(Category) {
			Category[Category["System"] = 0] = "System";
			Category[Category["Eyebrow"] = 1] = "Eyebrow";
			Category[Category["Eye"] = 2] = "Eye";
			Category[Category["Lip"] = 3] = "Lip";
			Category[Category["Other"] = 4] = "Other";
		})(Morph.Category || (Morph.Category = {}));
		(function(Type) {
			Type[Type["GroupMorph"] = 0] = "GroupMorph";
			Type[Type["VertexMorph"] = 1] = "VertexMorph";
			Type[Type["BoneMorph"] = 2] = "BoneMorph";
			Type[Type["UvMorph"] = 3] = "UvMorph";
			Type[Type["AdditionalUvMorph1"] = 4] = "AdditionalUvMorph1";
			Type[Type["AdditionalUvMorph2"] = 5] = "AdditionalUvMorph2";
			Type[Type["AdditionalUvMorph3"] = 6] = "AdditionalUvMorph3";
			Type[Type["AdditionalUvMorph4"] = 7] = "AdditionalUvMorph4";
			Type[Type["MaterialMorph"] = 8] = "MaterialMorph";
			Type[Type["FlipMorph"] = 9] = "FlipMorph";
			Type[Type["ImpulseMorph"] = 10] = "ImpulseMorph";
		})(Morph.Type || (Morph.Type = {}));
		(function(MaterialMorph) {
			(function(Type) {
				Type[Type["Multiply"] = 0] = "Multiply";
				Type[Type["Add"] = 1] = "Add";
			})(MaterialMorph.Type || (MaterialMorph.Type = {}));
		})(Morph.MaterialMorph || (Morph.MaterialMorph = {}));
	})(PmxObject.Morph || (PmxObject.Morph = {}));
	(function(DisplayFrame) {
		(function(FrameData) {
			(function(FrameType) {
				FrameType[FrameType["Bone"] = 0] = "Bone";
				FrameType[FrameType["Morph"] = 1] = "Morph";
			})(FrameData.FrameType || (FrameData.FrameType = {}));
		})(DisplayFrame.FrameData || (DisplayFrame.FrameData = {}));
	})(PmxObject.DisplayFrame || (PmxObject.DisplayFrame = {}));
	(function(RigidBody) {
		(function(ShapeType) {
			ShapeType[ShapeType["Sphere"] = 0] = "Sphere";
			ShapeType[ShapeType["Box"] = 1] = "Box";
			ShapeType[ShapeType["Capsule"] = 2] = "Capsule";
		})(RigidBody.ShapeType || (RigidBody.ShapeType = {}));
		(function(PhysicsMode) {
			PhysicsMode[PhysicsMode["FollowBone"] = 0] = "FollowBone";
			PhysicsMode[PhysicsMode["Physics"] = 1] = "Physics";
			PhysicsMode[PhysicsMode["PhysicsWithBone"] = 2] = "PhysicsWithBone";
		})(RigidBody.PhysicsMode || (RigidBody.PhysicsMode = {}));
	})(PmxObject.RigidBody || (PmxObject.RigidBody = {}));
	(function(Joint) {
		(function(Type) {
			Type[Type["Spring6dof"] = 0] = "Spring6dof";
			Type[Type["Sixdof"] = 1] = "Sixdof";
			Type[Type["P2p"] = 2] = "P2p";
			Type[Type["ConeTwist"] = 3] = "ConeTwist";
			Type[Type["Slider"] = 4] = "Slider";
			Type[Type["Hinge"] = 5] = "Hinge";
		})(Joint.Type || (Joint.Type = {}));
	})(PmxObject.Joint || (PmxObject.Joint = {}));
	(function(SoftBody) {
		(function(Type) {
			Type[Type["TriMesh"] = 0] = "TriMesh";
			Type[Type["Rope"] = 1] = "Rope";
		})(SoftBody.Type || (SoftBody.Type = {}));
		(function(Flag) {
			Flag[Flag["Blink"] = 1] = "Blink";
			Flag[Flag["ClusterCreation"] = 2] = "ClusterCreation";
			Flag[Flag["LinkCrossing"] = 4] = "LinkCrossing";
		})(SoftBody.Flag || (SoftBody.Flag = {}));
		(function(AeroDynamicModel) {
			AeroDynamicModel[AeroDynamicModel["VertexPoint"] = 0] = "VertexPoint";
			AeroDynamicModel[AeroDynamicModel["VertexTwoSided"] = 1] = "VertexTwoSided";
			AeroDynamicModel[AeroDynamicModel["VertexOneSided"] = 2] = "VertexOneSided";
			AeroDynamicModel[AeroDynamicModel["FaceTwoSided"] = 3] = "FaceTwoSided";
			AeroDynamicModel[AeroDynamicModel["FaceOneSided"] = 4] = "FaceOneSided";
		})(SoftBody.AeroDynamicModel || (SoftBody.AeroDynamicModel = {}));
	})(PmxObject.SoftBody || (PmxObject.SoftBody = {}));
})(PmxObject || (PmxObject = {}));
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/Parser/pmdReader.js
/**
* PmdReader is a static class that parses PMD data
*/
var PmdReader = class {
	constructor() {}
	/**
	* Parses PMD data asynchronously
	* @param data Arraybuffer of PMD data
	* @param logger Logger
	* @returns PMD data as a PmxObject
	* @throws {Error} If the parse fails
	*/
	static async ParseAsync(data, logger = new ConsoleLogger()) {
		const dataDeserializer = new MmdDataDeserializer(data);
		dataDeserializer.initializeTextDecoder("shift-jis");
		const header = this._ParseHeader(dataDeserializer);
		const vertices = await this._ParseVerticesAsync(dataDeserializer);
		const indices = this._ParseIndices(dataDeserializer);
		const partialMaterials = this._ParseMaterials(dataDeserializer);
		const bones = this._ParseBones(dataDeserializer);
		const iks = this._ParseIks(dataDeserializer);
		const morphs = this._ParseMorphs(dataDeserializer);
		const [displayFrames, boneFrameStartIndex] = this._ParseDisplayFrames(dataDeserializer, morphs);
		if (dataDeserializer.bytesAvailable === 0) {
			const textures = [];
			return {
				header,
				vertices,
				indices,
				textures,
				materials: this._ConvertMaterials(partialMaterials, textures),
				bones: this._ConvertBones(bones, iks, vertices, displayFrames),
				morphs,
				displayFrames,
				rigidBodies: [],
				joints: [],
				softBodies: []
			};
		}
		if (dataDeserializer.getUint8() !== 0) this._ParseEnglishNames(dataDeserializer, header, bones, morphs, displayFrames, boneFrameStartIndex);
		const textures = this._ParseToonTextures(dataDeserializer);
		const materials = this._ConvertMaterials(partialMaterials, textures);
		if (dataDeserializer.bytesAvailable === 0) return {
			header,
			vertices,
			indices,
			textures,
			materials,
			bones: this._ConvertBones(bones, iks, vertices, displayFrames),
			morphs,
			displayFrames,
			rigidBodies: [],
			joints: [],
			softBodies: []
		};
		const rigidBodies = this._ParseRigidBodies(dataDeserializer);
		const finalBones = this._ConvertBones(bones, iks, vertices, displayFrames, rigidBodies);
		this._NormalizeRigidBodyPositions(rigidBodies, finalBones);
		const joints = this._ParseJoints(dataDeserializer);
		if (dataDeserializer.bytesAvailable > 0) logger.warn(`There are ${dataDeserializer.bytesAvailable} bytes left after parsing`);
		return {
			header,
			vertices,
			indices,
			textures,
			materials,
			bones: finalBones,
			morphs,
			displayFrames,
			rigidBodies,
			joints,
			softBodies: []
		};
	}
	static _ParseHeader(dataDeserializer) {
		if (dataDeserializer.bytesAvailable < 7) throw new Error("is not pmd file");
		const signature = dataDeserializer.getSignatureString(3);
		if (signature !== "Pmd") throw new Error("is not pmd file");
		const version = dataDeserializer.getFloat32();
		const modelName = dataDeserializer.getDecoderString(20, true);
		const comment = dataDeserializer.getDecoderString(256, true);
		return {
			signature,
			version,
			encoding: PmxObject.Header.Encoding.ShiftJis,
			additionalVec4Count: 0,
			vertexIndexSize: 2,
			textureIndexSize: 4,
			materialIndexSize: 4,
			boneIndexSize: 2,
			morphIndexSize: 2,
			rigidBodyIndexSize: 4,
			modelName,
			englishModelName: "",
			comment,
			englishComment: ""
		};
	}
	static async _ParseVerticesAsync(dataDeserializer) {
		const verticesCount = dataDeserializer.getUint32();
		const vertices = [];
		let time = performance.now();
		for (let i = 0; i < verticesCount; ++i) {
			const position = dataDeserializer.getFloat32Tuple(3);
			const normal = dataDeserializer.getFloat32Tuple(3);
			const uv = dataDeserializer.getFloat32Tuple(2);
			const weightType = PmxObject.Vertex.BoneWeightType.Bdef2;
			const boneWeight = {
				boneIndices: [dataDeserializer.getUint16(), dataDeserializer.getUint16()],
				boneWeights: dataDeserializer.getUint8() / 100
			};
			const edgeFlag = dataDeserializer.getUint8() !== 0;
			vertices.push({
				position,
				normal,
				uv,
				additionalVec4: [],
				weightType,
				boneWeight,
				edgeScale: edgeFlag ? 1 : 0
			});
			if (i % 1e4 === 0 && 100 < performance.now() - time) {
				await new Promise((resolve) => setTimeout(resolve, 0));
				time = performance.now();
			}
		}
		return vertices;
	}
	static _ParseIndices(dataDeserializer) {
		const indicesCount = dataDeserializer.getUint32();
		const indices = new Uint16Array(indicesCount);
		dataDeserializer.getUint16Array(indices);
		return indices;
	}
	static _ParseMaterials(dataDeserializer) {
		const materialsCount = dataDeserializer.getUint32();
		const materials = [];
		for (let i = 0; i < materialsCount; ++i) {
			const diffuse = dataDeserializer.getFloat32Tuple(4);
			const shininess = dataDeserializer.getFloat32();
			const specular = dataDeserializer.getFloat32Tuple(3);
			const ambient = dataDeserializer.getFloat32Tuple(3);
			const toonTextureIndex = dataDeserializer.getInt8();
			const edgeFlag = dataDeserializer.getUint8();
			const indexCount = dataDeserializer.getUint32();
			const texturePath = dataDeserializer.getDecoderString(20, true);
			let flag = 0;
			if (edgeFlag !== 0) flag |= PmxObject.Material.Flag.EnabledToonEdge | PmxObject.Material.Flag.EnabledGroundShadow;
			if (diffuse[3] !== .98) flag |= PmxObject.Material.Flag.EnabledDrawShadow | PmxObject.Material.Flag.EnabledReceiveShadow;
			if (diffuse[3] < 1) flag |= PmxObject.Material.Flag.IsDoubleSided;
			let sphereTextureMode = PmxObject.Material.SphereTextureMode.Off;
			let diffuseTexturePath = "";
			let sphereTexturePath = "";
			{
				const paths = texturePath.split("*");
				for (let i = 0; i < paths.length; ++i) {
					const path = paths[i];
					let mode = PmxObject.Material.SphereTextureMode.Off;
					if (path !== "") {
						const extensionIndex = path.lastIndexOf(".");
						const extension = extensionIndex !== -1 ? path.substring(extensionIndex).toLowerCase() : "";
						if (extension === ".sph") mode = PmxObject.Material.SphereTextureMode.Multiply;
						else if (extension === ".spa") mode = PmxObject.Material.SphereTextureMode.Add;
					}
					if (mode !== PmxObject.Material.SphereTextureMode.Off) {
						sphereTextureMode = mode;
						sphereTexturePath = path;
					} else diffuseTexturePath = path;
				}
			}
			const material = {
				name: texturePath,
				englishName: "",
				diffuse,
				specular,
				shininess,
				ambient,
				flag,
				edgeColor: [
					0,
					0,
					0,
					1
				],
				edgeSize: 1,
				textureIndex: diffuseTexturePath,
				sphereTextureIndex: sphereTexturePath,
				sphereTextureMode,
				isSharedToonTexture: false,
				toonTextureIndex,
				comment: "",
				indexCount
			};
			materials.push(material);
		}
		return materials;
	}
	static _ParseBones(dataDeserializer) {
		const bonesCount = dataDeserializer.getUint16();
		const bones = [];
		for (let i = 0; i < bonesCount; ++i) {
			const bone = {
				name: dataDeserializer.getDecoderString(20, true),
				englishName: "",
				parentBoneIndex: dataDeserializer.getInt16(),
				tailIndex: dataDeserializer.getInt16(),
				type: dataDeserializer.getUint8(),
				ikIndex: dataDeserializer.getInt16(),
				position: dataDeserializer.getFloat32Tuple(3)
			};
			bones.push(bone);
		}
		return bones;
	}
	static _ParseIks(dataDeserializer) {
		const iksCount = dataDeserializer.getUint16();
		const iks = [];
		for (let i = 0; i < iksCount; ++i) {
			const boneIndex = dataDeserializer.getUint16();
			const targetIndex = dataDeserializer.getUint16();
			const ikLinkCount = dataDeserializer.getUint8();
			const iteration = dataDeserializer.getUint16();
			const rotationConstraint = dataDeserializer.getFloat32();
			const links = [];
			for (let j = 0; j < ikLinkCount; ++j) links.push(dataDeserializer.getUint16());
			const ik = {
				boneIndex,
				targetIndex,
				iteration,
				rotationConstraint,
				links
			};
			iks.push(ik);
		}
		return iks;
	}
	static _ParseMorphs(dataDeserializer) {
		const morphsCount = dataDeserializer.getUint16();
		if (morphsCount === 0) return [];
		const morphs = [];
		for (let i = 0; i < morphsCount; ++i) {
			const name = dataDeserializer.getDecoderString(20, true);
			const morphOffsetCount = dataDeserializer.getUint32();
			let morph = {
				name,
				englishName: "",
				category: dataDeserializer.getUint8(),
				type: PmxObject.Morph.Type.VertexMorph
			};
			const indices = new Int32Array(morphOffsetCount);
			const positions = new Float32Array(morphOffsetCount * 3);
			for (let i = 0; i < morphOffsetCount; ++i) {
				indices[i] = dataDeserializer.getUint32();
				positions[i * 3 + 0] = dataDeserializer.getFloat32();
				positions[i * 3 + 1] = dataDeserializer.getFloat32();
				positions[i * 3 + 2] = dataDeserializer.getFloat32();
			}
			morph = {
				...morph,
				indices,
				positions
			};
			morphs.push(morph);
		}
		const baseSkinIndices = morphs.shift().indices;
		for (let i = 0; i < morphs.length; ++i) {
			const indices = morphs[i].indices;
			for (let j = 0; j < indices.length; ++j) {
				const indexKey = indices[j];
				if (0 <= indexKey && indexKey < baseSkinIndices.length) indices[j] = baseSkinIndices[indexKey];
				else indices[j] = 0;
			}
		}
		return morphs;
	}
	static _ParseDisplayFrames(dataDeserializer, morphs) {
		const displayFrames = [];
		const morphDisplayFramesCount = dataDeserializer.getUint8();
		for (let i = 0; i < morphDisplayFramesCount; ++i) {
			const frame = {
				type: PmxObject.DisplayFrame.FrameData.FrameType.Morph,
				index: dataDeserializer.getUint16()
			};
			const displayFrame = {
				name: morphs[frame.index]?.name ?? "",
				englishName: "",
				isSpecialFrame: true,
				frames: [frame]
			};
			displayFrames.push(displayFrame);
		}
		const boneFrameStartIndex = displayFrames.length;
		const boneDisplayFramesCount = dataDeserializer.getUint8();
		for (let i = 0; i < boneDisplayFramesCount; ++i) {
			const boneDisplayFrame = {
				name: dataDeserializer.getDecoderString(50, true),
				englishName: "",
				isSpecialFrame: false,
				frames: void 0
			};
			displayFrames.push(boneDisplayFrame);
		}
		const frameBoneIndicesCount = dataDeserializer.getUint32();
		for (let i = 0; i < frameBoneIndicesCount; ++i) {
			const boneIndex = dataDeserializer.getUint16();
			const displayFrame = displayFrames[boneFrameStartIndex + dataDeserializer.getUint8() - 1];
			if (displayFrame !== void 0) {
				const frame = {
					type: PmxObject.DisplayFrame.FrameData.FrameType.Bone,
					index: boneIndex
				};
				if (displayFrame.frames === void 0) displayFrame.frames = [frame];
				else displayFrame.frames.push(frame);
			}
		}
		for (let i = boneFrameStartIndex; i < displayFrames.length; ++i) {
			const displayFrame = displayFrames[i];
			if (displayFrame.frames === void 0) displayFrame.frames = [];
		}
		return [displayFrames, boneFrameStartIndex];
	}
	static _ParseEnglishNames(dataDeserializer, header, bones, morphs, displayFrames, boneFrameStartIndex) {
		header.englishModelName = dataDeserializer.getDecoderString(20, true);
		header.englishComment = dataDeserializer.getDecoderString(256, true);
		for (let i = 0; i < bones.length; ++i) bones[i].englishName = dataDeserializer.getDecoderString(20, true);
		for (let i = 0; i < morphs.length; ++i) morphs[i].englishName = dataDeserializer.getDecoderString(20, true);
		for (let i = boneFrameStartIndex; i < displayFrames.length; ++i) displayFrames[i].englishName = dataDeserializer.getDecoderString(50, true);
	}
	static _ParseToonTextures(dataDeserializer) {
		const textures = [];
		for (let i = 0; i < 10; ++i) textures.push(dataDeserializer.getDecoderString(100, true));
		return textures;
	}
	static _PathNormalize(path) {
		path = path.replace(/\\/g, "/");
		const pathArray = path.split("/");
		const resultArray = [];
		for (let i = 0; i < pathArray.length; ++i) {
			const pathElement = pathArray[i];
			if (pathElement === ".") continue;
			else if (pathElement === "..") resultArray.pop();
			else resultArray.push(pathElement);
		}
		return resultArray.join("/").toLowerCase();
	}
	static _ConvertMaterials(materials, textures) {
		const normalizedTextures = new Array(textures.length);
		for (let i = 0; i < textures.length; ++i) normalizedTextures[i] = this._PathNormalize(textures[i]);
		for (let i = 0; i < materials.length; ++i) {
			const material = materials[i];
			if (0 <= material.toonTextureIndex && material.toonTextureIndex < textures.length) {
				const normalizedToonTexturePath = normalizedTextures[material.toonTextureIndex];
				if (/toon(10|0[0-9])\.bmp/.test(normalizedToonTexturePath)) {
					material.isSharedToonTexture = true;
					let toonTextureIndex = normalizedToonTexturePath.substring(normalizedToonTexturePath.length - 6, normalizedToonTexturePath.length - 4);
					if (toonTextureIndex[0] === "n") toonTextureIndex = toonTextureIndex[1];
					material.toonTextureIndex = parseInt(toonTextureIndex, 10) - 1;
				}
			}
		}
		const textureIndexMap = /* @__PURE__ */ new Map();
		for (let i = 0; i < textures.length; ++i) textureIndexMap.set(this._PathNormalize(textures[i]), i);
		for (let i = 0; i < materials.length; ++i) {
			const material = materials[i];
			if (material.textureIndex !== "") {
				const normalizedDiffuseTexturePath = this._PathNormalize(material.textureIndex);
				let diffuseTextureIndex = textureIndexMap.get(normalizedDiffuseTexturePath);
				if (diffuseTextureIndex === void 0) {
					diffuseTextureIndex = textureIndexMap.size;
					textureIndexMap.set(normalizedDiffuseTexturePath, diffuseTextureIndex);
					textures.push(material.textureIndex);
				}
				material.textureIndex = diffuseTextureIndex;
			} else material.textureIndex = -1;
			if (material.sphereTextureIndex !== "") {
				const normalizedSphereTexturePath = this._PathNormalize(material.sphereTextureIndex);
				let sphereTextureIndex = textureIndexMap.get(normalizedSphereTexturePath);
				if (sphereTextureIndex === void 0) {
					sphereTextureIndex = textureIndexMap.size;
					textureIndexMap.set(normalizedSphereTexturePath, sphereTextureIndex);
					textures.push(material.sphereTextureIndex);
				}
				material.sphereTextureIndex = sphereTextureIndex;
			} else material.sphereTextureIndex = -1;
		}
		return materials;
	}
	/**
	* from pmx editor IK制限角.txt
	* format: minX, maxX, minY, maxY, minZ, maxZ
	*
	* 左ひざ,-180.0,-0.5,0.0,0.0,0.0,0.0
	* 右ひざ,-180.0,-0.5,0.0,0.0,0.0,0.0
	*/
	static _IkAngleLimitTable = new Map(Object.entries({
		"左ひざ": [
			-180,
			-.5,
			0,
			0,
			0,
			0
		],
		"右ひざ": [
			-180,
			-.5,
			0,
			0,
			0,
			0
		]
	}));
	static _ConvertBones(bones, iks, vertices, displayFrames, rigidBodies) {
		const ikMap = /* @__PURE__ */ new Map();
		for (let i = 0; i < iks.length; ++i) {
			const ikBoneIndex = iks[i].boneIndex;
			if (0 <= ikBoneIndex && ikBoneIndex < bones.length && !ikMap.has(ikBoneIndex)) ikMap.set(ikBoneIndex, i);
		}
		const finalBones = [];
		for (let i = 0; i < bones.length; ++i) {
			const bone = bones[i];
			const pmxBone = {
				name: bone.name,
				englishName: bone.englishName,
				position: bone.position,
				parentBoneIndex: bone.parentBoneIndex,
				transformOrder: 0,
				flag: PmxObject.Bone.Flag.UseBoneIndexAsTailPosition,
				tailPosition: bone.tailIndex <= 0 ? -1 : bone.tailIndex,
				appendTransform: void 0,
				axisLimit: void 0,
				localVector: void 0,
				externalParentTransform: void 0,
				ik: void 0
			};
			let isIkBone = ikMap.has(i);
			pmxBone.flag |= PmxObject.Bone.Flag.IsRotatable | PmxObject.Bone.Flag.IsVisible | PmxObject.Bone.Flag.IsControllable;
			pmxBone.flag &= ~PmxObject.Bone.Flag.IsMovable & ~PmxObject.Bone.Flag.IsIkEnabled & ~PmxObject.Bone.Flag.HasAppendRotate & ~PmxObject.Bone.Flag.HasAxisLimit;
			switch (bone.type) {
				case PmdObject.Bone.Type.RotateMove:
					pmxBone.flag |= PmxObject.Bone.Flag.IsMovable;
					break;
				case PmdObject.Bone.Type.Ik:
					isIkBone = true;
					break;
				case PmdObject.Bone.Type.RotateEffect:
					pmxBone.flag |= PmxObject.Bone.Flag.HasAppendRotate;
					pmxBone.flag &= ~PmxObject.Bone.Flag.UseBoneIndexAsTailPosition & ~PmxObject.Bone.Flag.IsVisible;
					pmxBone.appendTransform = {
						parentIndex: bone.tailIndex,
						ratio: bone.ikIndex * .01
					};
					break;
			}
			if (isIkBone) {
				pmxBone.flag |= PmxObject.Bone.Flag.IsMovable | PmxObject.Bone.Flag.IsIkEnabled;
				pmxBone.transformOrder = 1;
			}
			finalBones.push(pmxBone);
		}
		let boneCount = Math.min(finalBones.length, bones.length);
		for (let i = 0; i < boneCount; ++i) {
			const bone = bones[i];
			const pmxBone = finalBones[i];
			if (bone.type === PmdObject.Bone.Type.Twist) {
				let tailBone = bones[bone.tailIndex];
				if (tailBone === void 0) tailBone = bones[0];
				const tailBonePosition = tailBone.position;
				const bonePosition = bone.position;
				pmxBone.axisLimit = [
					tailBonePosition[0] - bonePosition[0],
					tailBonePosition[1] - bonePosition[1],
					tailBonePosition[2] - bonePosition[2]
				];
				const axisLimit = pmxBone.axisLimit;
				const length = Math.sqrt(axisLimit[0] * axisLimit[0] + axisLimit[1] * axisLimit[1] + axisLimit[2] * axisLimit[2]);
				axisLimit[0] /= length;
				axisLimit[1] /= length;
				axisLimit[2] /= length;
				pmxBone.flag &= ~PmxObject.Bone.Flag.UseBoneIndexAsTailPosition;
			}
		}
		const ikChainBones = [];
		for (let boneIndex = 0; boneIndex < boneCount; ++boneIndex) {
			const pmxBone = finalBones[boneIndex];
			if ((pmxBone.flag & PmxObject.Bone.Flag.IsIkEnabled) === 0) continue;
			let ikCount = 0;
			for (let ikIndex = 0; ikIndex < iks.length; ++ikIndex) {
				const ik = iks[ikIndex];
				if (ik.boneIndex !== boneIndex) continue;
				let pmxChainBone;
				if (ikCount === 0) {
					pmxChainBone = pmxBone;
					ikCount += 1;
				} else {
					pmxChainBone = {
						name: pmxBone.name + "+",
						englishName: pmxBone.englishName,
						position: [...pmxBone.position],
						parentBoneIndex: boneIndex,
						transformOrder: pmxBone.transformOrder,
						flag: pmxBone.flag & ~PmxObject.Bone.Flag.IsVisible & ~PmxObject.Bone.Flag.UseBoneIndexAsTailPosition,
						tailPosition: [
							0,
							0,
							0
						],
						appendTransform: pmxBone.appendTransform !== void 0 ? { ...pmxBone.appendTransform } : void 0,
						axisLimit: pmxBone.axisLimit !== void 0 ? [...pmxBone.axisLimit] : void 0,
						localVector: pmxBone.localVector !== void 0 ? {
							x: [...pmxBone.localVector.x],
							z: [...pmxBone.localVector.z]
						} : void 0,
						externalParentTransform: pmxBone.externalParentTransform,
						ik: void 0
					};
					ikChainBones.push(pmxChainBone);
					ikCount += 1;
				}
				if (pmxChainBone.ik === void 0) pmxChainBone.ik = {
					target: 0,
					iteration: 0,
					rotationConstraint: 0,
					links: []
				};
				{
					const pmxChainBoneIk = pmxChainBone.ik;
					pmxChainBoneIk.target = ik.targetIndex;
					pmxChainBoneIk.iteration = ik.iteration;
					pmxChainBoneIk.rotationConstraint = ik.rotationConstraint * 4;
					const ikLinks = ik.links;
					for (let ikLinkIndex = 0; ikLinkIndex < ikLinks.length; ++ikLinkIndex) {
						const ikLink = ikLinks[ikLinkIndex];
						if (0 <= ikLink && ikLink < finalBones.length) {
							const pmxIkLink = {
								target: ikLink,
								limitation: void 0
							};
							if (0 <= ikLink && ikLink < bones.length) {
								const chainName = bones[ikLink].name;
								const limitation = this._IkAngleLimitTable.get(chainName);
								if (limitation !== void 0) pmxIkLink.limitation = {
									minimumAngle: [
										limitation[0],
										limitation[2],
										limitation[4]
									],
									maximumAngle: [
										limitation[1],
										limitation[3],
										limitation[5]
									]
								};
							}
							pmxChainBoneIk.links.push(pmxIkLink);
						}
					}
				}
			}
		}
		finalBones.push(...ikChainBones);
		boneCount = Math.min(finalBones.length, bones.length);
		const ikIndexMap = [];
		for (let i = 0; i < boneCount; ++i) {
			if ((finalBones[i].flag & PmxObject.Bone.Flag.IsIkEnabled) === 0) continue;
			for (let j = 0; j < iks.length; ++j) if (iks[j].boneIndex === i) {
				ikIndexMap.push([i, j]);
				break;
			}
		}
		let isPmdAssendingOrder = true;
		for (let i = 0; i < ikIndexMap.length - 1; ++i) if (ikIndexMap[i][1] > ikIndexMap[i + 1][1]) {
			isPmdAssendingOrder = false;
			break;
		}
		if (!isPmdAssendingOrder) {
			ikIndexMap.sort((a, b) => a[1] - b[1]);
			const invalidOrderPmxBoneMap = new Array(ikIndexMap.length);
			for (let i = 1; i < ikIndexMap.length; ++i) {
				let isValid = true;
				if (ikIndexMap[i - 1][0] > ikIndexMap[i][0]) isValid = false;
				else if (invalidOrderPmxBoneMap[i - 1] !== void 0) isValid = false;
				if (!isValid) invalidOrderPmxBoneMap[i] = finalBones[ikIndexMap[i - 1][0]];
			}
			const pmxBoneToInvalidMap = /* @__PURE__ */ new Map();
			for (let i = 0; i < invalidOrderPmxBoneMap.length; ++i) {
				const pmxBone = invalidOrderPmxBoneMap[i];
				if (pmxBone !== void 0 && !pmxBoneToInvalidMap.has(pmxBone)) pmxBoneToInvalidMap.set(pmxBone, i);
			}
			const pmdSortedPmxBones = new Array(ikIndexMap.length);
			for (let i = 0; i < ikIndexMap.length; ++i) pmdSortedPmxBones[i] = finalBones[ikIndexMap[i][0]];
			const oldFinalBones = finalBones.slice();
			for (let i = 0; 0 < pmxBoneToInvalidMap.size; ++i) {
				for (let j = 1; j < ikIndexMap.length; ++j) if (invalidOrderPmxBoneMap[j] !== void 0 && pmdSortedPmxBones[j] !== void 0 && !pmxBoneToInvalidMap.has(pmdSortedPmxBones[j])) {
					const pmxBone = pmdSortedPmxBones[j];
					const removeIndex = finalBones.indexOf(pmxBone);
					finalBones.splice(removeIndex, 1);
					const insertIndex = finalBones.indexOf(invalidOrderPmxBoneMap[j]) + 1;
					finalBones.splice(insertIndex, 0, pmxBone);
					pmxBoneToInvalidMap.delete(pmxBone);
				}
				if (ikIndexMap.length < i) break;
			}
			const boneToIndexTable = /* @__PURE__ */ new Map();
			for (let i = 0; i < finalBones.length; ++i) {
				const pmxBone = finalBones[i];
				boneToIndexTable.set(pmxBone, i);
			}
			for (let i = 0; i < vertices.length; ++i) {
				const boneWeight = vertices[i].boneWeight;
				if (typeof boneWeight.boneIndices === "number") boneWeight.boneIndices = boneToIndexTable.get(oldFinalBones[boneWeight.boneIndices]);
				else {
					const boneIndices = boneWeight.boneIndices;
					for (let j = 0; j < boneIndices.length; ++j) boneIndices[j] = boneToIndexTable.get(oldFinalBones[boneIndices[j]]);
				}
			}
			for (let i = 0; i < finalBones.length; ++i) {
				const pmxBone = finalBones[i];
				pmxBone.parentBoneIndex = boneToIndexTable.get(oldFinalBones[pmxBone.parentBoneIndex]);
				if (typeof pmxBone.tailPosition === "number") pmxBone.tailPosition = boneToIndexTable.get(oldFinalBones[pmxBone.tailPosition]);
				if (pmxBone.appendTransform) pmxBone.appendTransform.parentIndex = boneToIndexTable.get(oldFinalBones[pmxBone.appendTransform.parentIndex]);
				if (pmxBone.ik) {
					pmxBone.ik.target = boneToIndexTable.get(oldFinalBones[pmxBone.ik.target]);
					const ikLinks = pmxBone.ik.links;
					for (let j = 0; j < ikLinks.length; ++j) ikLinks[j].target = boneToIndexTable.get(oldFinalBones[ikLinks[j].target]);
				}
			}
			for (let i = 0; i < displayFrames.length; ++i) {
				const frames = displayFrames[i].frames;
				if (frames === void 0) continue;
				for (let j = 0; j < frames.length; ++j) {
					const frame = frames[j];
					if (frame.type === PmxObject.DisplayFrame.FrameData.FrameType.Bone) frame.index = boneToIndexTable.get(oldFinalBones[frame.index]);
				}
			}
			if (rigidBodies !== void 0) for (let i = 0; i < rigidBodies.length; ++i) {
				const rigidBody = rigidBodies[i];
				rigidBody.boneIndex = boneToIndexTable.get(oldFinalBones[rigidBody.boneIndex]);
			}
		}
		let hasLoop = false;
		for (let i = 0; i < finalBones.length; ++i) {
			let pmxBone = finalBones[i];
			for (let j = 0; j < finalBones.length; ++j) {
				const parentBoneIndex = finalBones[j].parentBoneIndex;
				if (parentBoneIndex === i) {
					hasLoop = true;
					break;
				}
				pmxBone = finalBones[parentBoneIndex];
				if (pmxBone === void 0) break;
			}
			if (hasLoop) break;
		}
		if (hasLoop) for (let i = 0; i < finalBones.length; ++i) {
			let orderUpdated = false;
			for (let j = 0; j < finalBones.length; ++j) {
				const pmxBone = finalBones[j];
				let ancestorPmxBone = pmxBone;
				let transformOrder = pmxBone.transformOrder;
				for (;;) {
					const parentPmxBone = finalBones[ancestorPmxBone.parentBoneIndex];
					if (parentPmxBone === void 0) break;
					if (transformOrder < parentPmxBone.transformOrder) {
						transformOrder = parentPmxBone.transformOrder;
						orderUpdated = true;
					}
					ancestorPmxBone = parentPmxBone;
				}
				pmxBone.transformOrder = transformOrder;
			}
			if (!orderUpdated) break;
		}
		for (let i = 0; i < finalBones.length; ++i) {
			const pmxBone = finalBones[i];
			if ((pmxBone.flag & PmxObject.Bone.Flag.UseBoneIndexAsTailPosition) !== 0) {
				if (!(typeof pmxBone.tailPosition === "number")) pmxBone.tailPosition = -1;
			} else if (typeof pmxBone.tailPosition === "number") pmxBone.tailPosition = [
				0,
				0,
				0
			];
		}
		return finalBones;
	}
	static _ParseRigidBodies(dataDeserializer) {
		const rigidBodiesCount = dataDeserializer.getUint32();
		const rigidBodies = [];
		for (let i = 0; i < rigidBodiesCount; ++i) {
			const rigidBody = {
				name: dataDeserializer.getDecoderString(20, true),
				englishName: "",
				boneIndex: dataDeserializer.getInt16(),
				collisionGroup: dataDeserializer.getUint8(),
				collisionMask: dataDeserializer.getUint16(),
				shapeType: dataDeserializer.getUint8(),
				shapeSize: dataDeserializer.getFloat32Tuple(3),
				shapePosition: dataDeserializer.getFloat32Tuple(3),
				shapeRotation: dataDeserializer.getFloat32Tuple(3),
				mass: dataDeserializer.getFloat32(),
				linearDamping: dataDeserializer.getFloat32(),
				angularDamping: dataDeserializer.getFloat32(),
				repulsion: dataDeserializer.getFloat32(),
				friction: dataDeserializer.getFloat32(),
				physicsMode: dataDeserializer.getUint8()
			};
			rigidBodies.push(rigidBody);
		}
		return rigidBodies;
	}
	static _NormalizeRigidBodyPositions(rigidBodies, bones) {
		for (let i = 0; i < rigidBodies.length; ++i) {
			const rigidBody = rigidBodies[i];
			const bonePosition = bones[rigidBody.boneIndex < 0 ? 0 : rigidBody.boneIndex].position;
			const rigidBodyPosition = rigidBody.shapePosition;
			rigidBodyPosition[0] += bonePosition[0];
			rigidBodyPosition[1] += bonePosition[1];
			rigidBodyPosition[2] += bonePosition[2];
		}
	}
	static _ParseJoints(dataDeserializer) {
		const jointsCount = dataDeserializer.getUint32();
		const joints = [];
		for (let i = 0; i < jointsCount; ++i) {
			const name = dataDeserializer.getDecoderString(20, true);
			const rigidbodyIndexA = dataDeserializer.getInt32();
			const rigidbodyIndexB = dataDeserializer.getInt32();
			const position = dataDeserializer.getFloat32Tuple(3);
			const rotation = dataDeserializer.getFloat32Tuple(3);
			const positionMin = dataDeserializer.getFloat32Tuple(3);
			const positionMax = dataDeserializer.getFloat32Tuple(3);
			const rotationMin = dataDeserializer.getFloat32Tuple(3);
			const rotationMax = dataDeserializer.getFloat32Tuple(3);
			const springPosition = dataDeserializer.getFloat32Tuple(3);
			const springRotation = dataDeserializer.getFloat32Tuple(3);
			const joint = {
				name,
				englishName: "",
				type: PmxObject.Joint.Type.Spring6dof,
				rigidbodyIndexA,
				rigidbodyIndexB,
				position,
				rotation,
				positionMin,
				positionMax,
				rotationMin,
				rotationMax,
				springPosition,
				springRotation
			};
			joints.push(joint);
		}
		return joints;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/Parser/pmxReader.js
var IndexReader = class {
	_vertexIndexSize;
	_textureIndexSize;
	_materialIndexSize;
	_boneIndexSize;
	_morphIndexSize;
	_rigidBodyIndexSize;
	constructor(vertexIndexSize, textureIndexSize, materialIndexSize, boneIndexSize, morphIndexSize, rigidBodyIndexSize) {
		this._vertexIndexSize = vertexIndexSize;
		this._textureIndexSize = textureIndexSize;
		this._materialIndexSize = materialIndexSize;
		this._boneIndexSize = boneIndexSize;
		this._morphIndexSize = morphIndexSize;
		this._rigidBodyIndexSize = rigidBodyIndexSize;
	}
	getVertexIndex(dataDeserializer) {
		switch (this._vertexIndexSize) {
			case 1: return dataDeserializer.getUint8();
			case 2: return dataDeserializer.getUint16();
			case 4: return dataDeserializer.getInt32();
			default: throw new Error(`Invalid vertexIndexSize: ${this._vertexIndexSize}`);
		}
	}
	_getNonVertexIndex(dataDeserializer, indexSize) {
		switch (indexSize) {
			case 1: return dataDeserializer.getInt8();
			case 2: return dataDeserializer.getInt16();
			case 4: return dataDeserializer.getInt32();
			default: throw new Error(`Invalid indexSize: ${indexSize}`);
		}
	}
	getTextureIndex(dataDeserializer) {
		return this._getNonVertexIndex(dataDeserializer, this._textureIndexSize);
	}
	getMaterialIndex(dataDeserializer) {
		return this._getNonVertexIndex(dataDeserializer, this._materialIndexSize);
	}
	getBoneIndex(dataDeserializer) {
		return this._getNonVertexIndex(dataDeserializer, this._boneIndexSize);
	}
	getMorphIndex(dataDeserializer) {
		return this._getNonVertexIndex(dataDeserializer, this._morphIndexSize);
	}
	getRigidBodyIndex(dataDeserializer) {
		return this._getNonVertexIndex(dataDeserializer, this._rigidBodyIndexSize);
	}
};
/**
* PmxReader is a static class that parses PMX data
*/
var PmxReader = class {
	constructor() {}
	/**
	* Parses PMX data asynchronously
	* @param data Arraybuffer of PMX data
	* @param logger Logger
	* @returns PMX data
	* @throws {Error} If the parse fails
	*/
	static async ParseAsync(data, logger = new ConsoleLogger()) {
		const dataDeserializer = new MmdDataDeserializer(data);
		const header = this._ParseHeader(dataDeserializer, logger);
		const indexReader = new IndexReader(header.vertexIndexSize, header.textureIndexSize, header.materialIndexSize, header.boneIndexSize, header.morphIndexSize, header.rigidBodyIndexSize);
		const vertices = await this._ParseVerticesAsync(dataDeserializer, indexReader, header);
		const indices = this._ParseIndices(dataDeserializer, indexReader, header);
		const textures = this._ParseTextures(dataDeserializer);
		const materials = this._ParseMaterials(dataDeserializer, indexReader);
		const bones = this._ParseBones(dataDeserializer, indexReader);
		const morphs = this._ParseMorphs(dataDeserializer, indexReader);
		const displayFrames = this._ParseDisplayFrames(dataDeserializer, indexReader);
		const rigidBodies = this._ParseRigidBodies(dataDeserializer, indexReader);
		const joints = this._ParseJoints(dataDeserializer, indexReader);
		const softBodies = header.version <= 2 ? [] : this._ParseSoftBodies(dataDeserializer, indexReader, header);
		if (dataDeserializer.bytesAvailable > 0) logger.warn(`There are ${dataDeserializer.bytesAvailable} bytes left after parsing`);
		return {
			header,
			vertices,
			indices,
			textures,
			materials,
			bones,
			morphs,
			displayFrames,
			rigidBodies,
			joints,
			softBodies
		};
	}
	static _ParseHeader(dataDeserializer, logger) {
		if (dataDeserializer.bytesAvailable < 17) throw new RangeError("is not pmx file");
		const signature = dataDeserializer.getSignatureString(3);
		if (signature !== "PMX") throw new RangeError("is not pmx file");
		dataDeserializer.getInt8();
		const version = dataDeserializer.getFloat32();
		const globalsCount = dataDeserializer.getUint8();
		const encoding = dataDeserializer.getUint8();
		dataDeserializer.initializeTextDecoder(encoding === PmxObject.Header.Encoding.Utf8 ? "utf-8" : "utf-16le");
		const additionalVec4Count = dataDeserializer.getUint8();
		const vertexIndexSize = dataDeserializer.getUint8();
		const textureIndexSize = dataDeserializer.getUint8();
		const materialIndexSize = dataDeserializer.getUint8();
		const boneIndexSize = dataDeserializer.getUint8();
		const morphIndexSize = dataDeserializer.getUint8();
		const rigidBodyIndexSize = dataDeserializer.getUint8();
		if (globalsCount < 8) throw new Error(`Invalid globalsCount: ${globalsCount}`);
		else if (8 < globalsCount) {
			logger.warn(`globalsCount is greater than 8: ${globalsCount} files may be corrupted or higher version`);
			for (let i = 8; i < globalsCount; ++i) dataDeserializer.getUint8();
		}
		return {
			signature,
			version,
			encoding,
			additionalVec4Count,
			vertexIndexSize,
			textureIndexSize,
			materialIndexSize,
			boneIndexSize,
			morphIndexSize,
			rigidBodyIndexSize,
			modelName: dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false),
			englishModelName: dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false),
			comment: dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false),
			englishComment: dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false)
		};
	}
	static async _ParseVerticesAsync(dataDeserializer, indexReader, header) {
		const verticesCount = dataDeserializer.getInt32();
		const vertices = [];
		let time = performance.now();
		for (let i = 0; i < verticesCount; ++i) {
			const position = dataDeserializer.getFloat32Tuple(3);
			const normal = dataDeserializer.getFloat32Tuple(3);
			const uv = dataDeserializer.getFloat32Tuple(2);
			const additionalVec4 = [];
			for (let j = 0; j < header.additionalVec4Count; ++j) additionalVec4.push(dataDeserializer.getFloat32Tuple(4));
			const weightType = dataDeserializer.getUint8();
			let boneWeight;
			switch (weightType) {
				case PmxObject.Vertex.BoneWeightType.Bdef1:
					boneWeight = {
						boneIndices: indexReader.getBoneIndex(dataDeserializer),
						boneWeights: null
					};
					break;
				case PmxObject.Vertex.BoneWeightType.Bdef2:
					boneWeight = {
						boneIndices: [indexReader.getBoneIndex(dataDeserializer), indexReader.getBoneIndex(dataDeserializer)],
						boneWeights: dataDeserializer.getFloat32()
					};
					break;
				case PmxObject.Vertex.BoneWeightType.Bdef4:
					boneWeight = {
						boneIndices: [
							indexReader.getBoneIndex(dataDeserializer),
							indexReader.getBoneIndex(dataDeserializer),
							indexReader.getBoneIndex(dataDeserializer),
							indexReader.getBoneIndex(dataDeserializer)
						],
						boneWeights: [
							dataDeserializer.getFloat32(),
							dataDeserializer.getFloat32(),
							dataDeserializer.getFloat32(),
							dataDeserializer.getFloat32()
						]
					};
					break;
				case PmxObject.Vertex.BoneWeightType.Sdef:
					boneWeight = {
						boneIndices: [indexReader.getBoneIndex(dataDeserializer), indexReader.getBoneIndex(dataDeserializer)],
						boneWeights: {
							boneWeight0: dataDeserializer.getFloat32(),
							c: dataDeserializer.getFloat32Tuple(3),
							r0: dataDeserializer.getFloat32Tuple(3),
							r1: dataDeserializer.getFloat32Tuple(3)
						}
					};
					break;
				case PmxObject.Vertex.BoneWeightType.Qdef:
					boneWeight = {
						boneIndices: [
							indexReader.getBoneIndex(dataDeserializer),
							indexReader.getBoneIndex(dataDeserializer),
							indexReader.getBoneIndex(dataDeserializer),
							indexReader.getBoneIndex(dataDeserializer)
						],
						boneWeights: [
							dataDeserializer.getFloat32(),
							dataDeserializer.getFloat32(),
							dataDeserializer.getFloat32(),
							dataDeserializer.getFloat32()
						]
					};
					break;
				default: throw new Error(`Invalid weightType: ${weightType}`);
			}
			const edgeScale = dataDeserializer.getFloat32();
			vertices.push({
				position,
				normal,
				uv,
				additionalVec4,
				weightType,
				boneWeight,
				edgeScale
			});
			if (i % 1e4 === 0 && 100 < performance.now() - time) {
				await new Promise((resolve) => setTimeout(resolve, 0));
				time = performance.now();
			}
		}
		return vertices;
	}
	static _ParseIndices(dataDeserializer, indexReader, header) {
		const indicesCount = dataDeserializer.getInt32();
		const indexArrayBuffer = new ArrayBuffer(indicesCount * header.vertexIndexSize);
		let indices;
		switch (header.vertexIndexSize) {
			case 1:
				indices = new Uint8Array(indexArrayBuffer);
				break;
			case 2:
				indices = new Uint16Array(indexArrayBuffer);
				break;
			case 4:
				indices = new Int32Array(indexArrayBuffer);
				break;
			default: throw new Error(`Invalid vertexIndexSize: ${header.vertexIndexSize}`);
		}
		for (let i = 0; i < indicesCount; ++i) indices[i] = indexReader.getVertexIndex(dataDeserializer);
		return indices;
	}
	static _ParseTextures(dataDeserializer) {
		const texturesCount = dataDeserializer.getInt32();
		const textures = [];
		for (let i = 0; i < texturesCount; ++i) {
			const textureName = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			textures.push(textureName);
		}
		return textures;
	}
	static _ParseMaterials(dataDeserializer, indexReader) {
		const materialsCount = dataDeserializer.getInt32();
		const materials = [];
		for (let i = 0; i < materialsCount; ++i) {
			const name = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const englishName = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const diffuse = dataDeserializer.getFloat32Tuple(4);
			const specular = dataDeserializer.getFloat32Tuple(3);
			const shininess = dataDeserializer.getFloat32();
			const ambient = dataDeserializer.getFloat32Tuple(3);
			const flag = dataDeserializer.getUint8();
			const edgeColor = dataDeserializer.getFloat32Tuple(4);
			const edgeSize = dataDeserializer.getFloat32();
			const textureIndex = indexReader.getTextureIndex(dataDeserializer);
			const sphereTextureIndex = indexReader.getTextureIndex(dataDeserializer);
			const sphereTextureMode = dataDeserializer.getUint8();
			const isSharedToonTexture = dataDeserializer.getUint8() === 1;
			const material = {
				name,
				englishName,
				diffuse,
				specular,
				shininess,
				ambient,
				flag,
				edgeColor,
				edgeSize,
				textureIndex,
				sphereTextureIndex,
				sphereTextureMode,
				isSharedToonTexture,
				toonTextureIndex: isSharedToonTexture ? dataDeserializer.getUint8() : indexReader.getTextureIndex(dataDeserializer),
				comment: dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false),
				indexCount: dataDeserializer.getInt32()
			};
			materials.push(material);
		}
		return materials;
	}
	static _ParseBones(dataDeserializer, indexReader) {
		const bonesCount = dataDeserializer.getInt32();
		const bones = [];
		for (let i = 0; i < bonesCount; ++i) {
			const name = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const englishName = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const position = dataDeserializer.getFloat32Tuple(3);
			const parentBoneIndex = indexReader.getBoneIndex(dataDeserializer);
			const transformOrder = dataDeserializer.getInt32();
			const flag = dataDeserializer.getUint16();
			let tailPosition;
			if (flag & PmxObject.Bone.Flag.UseBoneIndexAsTailPosition) tailPosition = indexReader.getBoneIndex(dataDeserializer);
			else tailPosition = dataDeserializer.getFloat32Tuple(3);
			let appendTransform;
			if (flag & PmxObject.Bone.Flag.HasAppendMove || flag & PmxObject.Bone.Flag.HasAppendRotate) appendTransform = {
				parentIndex: indexReader.getBoneIndex(dataDeserializer),
				ratio: dataDeserializer.getFloat32()
			};
			let axisLimit;
			if (flag & PmxObject.Bone.Flag.HasAxisLimit) axisLimit = dataDeserializer.getFloat32Tuple(3);
			let localVector;
			if (flag & PmxObject.Bone.Flag.HasLocalVector) localVector = {
				x: dataDeserializer.getFloat32Tuple(3),
				z: dataDeserializer.getFloat32Tuple(3)
			};
			let externalParentTransform;
			if (flag & PmxObject.Bone.Flag.IsExternalParentTransformed) externalParentTransform = dataDeserializer.getInt32();
			let ik;
			if (flag & PmxObject.Bone.Flag.IsIkEnabled) {
				const target = indexReader.getBoneIndex(dataDeserializer);
				const iteration = dataDeserializer.getInt32();
				const rotationConstraint = dataDeserializer.getFloat32();
				const links = [];
				const linksCount = dataDeserializer.getInt32();
				for (let i = 0; i < linksCount; ++i) {
					const link = {
						target: indexReader.getBoneIndex(dataDeserializer),
						limitation: dataDeserializer.getUint8() === 1 ? {
							minimumAngle: dataDeserializer.getFloat32Tuple(3),
							maximumAngle: dataDeserializer.getFloat32Tuple(3)
						} : void 0
					};
					links.push(link);
				}
				ik = {
					target,
					iteration,
					rotationConstraint,
					links
				};
			}
			const bone = {
				name,
				englishName,
				position,
				parentBoneIndex,
				transformOrder,
				flag,
				tailPosition,
				appendTransform,
				axisLimit,
				localVector,
				externalParentTransform,
				ik
			};
			bones.push(bone);
		}
		return bones;
	}
	static _ParseMorphs(dataDeserializer, indexReader) {
		const morphsCount = dataDeserializer.getInt32();
		const morphs = [];
		for (let i = 0; i < morphsCount; ++i) {
			const name = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const englishName = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const category = dataDeserializer.getInt8();
			const type = dataDeserializer.getInt8();
			let morph = {
				name,
				englishName,
				category,
				type
			};
			const morphOffsetCount = dataDeserializer.getInt32();
			switch (type) {
				case PmxObject.Morph.Type.GroupMorph:
					{
						const indices = new Int32Array(morphOffsetCount);
						const ratios = new Float32Array(morphOffsetCount);
						for (let i = 0; i < morphOffsetCount; ++i) {
							indices[i] = indexReader.getMorphIndex(dataDeserializer);
							ratios[i] = dataDeserializer.getFloat32();
						}
						morph = {
							...morph,
							indices,
							ratios
						};
					}
					break;
				case PmxObject.Morph.Type.VertexMorph:
					{
						const indices = new Int32Array(morphOffsetCount);
						const positions = new Float32Array(morphOffsetCount * 3);
						for (let i = 0; i < morphOffsetCount; ++i) {
							indices[i] = indexReader.getVertexIndex(dataDeserializer);
							positions[i * 3 + 0] = dataDeserializer.getFloat32();
							positions[i * 3 + 1] = dataDeserializer.getFloat32();
							positions[i * 3 + 2] = dataDeserializer.getFloat32();
						}
						morph = {
							...morph,
							indices,
							positions
						};
					}
					break;
				case PmxObject.Morph.Type.BoneMorph:
					{
						const indices = new Int32Array(morphOffsetCount);
						const positions = new Float32Array(morphOffsetCount * 3);
						const rotations = new Float32Array(morphOffsetCount * 4);
						for (let i = 0; i < morphOffsetCount; ++i) {
							indices[i] = indexReader.getBoneIndex(dataDeserializer);
							positions[i * 3 + 0] = dataDeserializer.getFloat32();
							positions[i * 3 + 1] = dataDeserializer.getFloat32();
							positions[i * 3 + 2] = dataDeserializer.getFloat32();
							rotations[i * 4 + 0] = dataDeserializer.getFloat32();
							rotations[i * 4 + 1] = dataDeserializer.getFloat32();
							rotations[i * 4 + 2] = dataDeserializer.getFloat32();
							rotations[i * 4 + 3] = dataDeserializer.getFloat32();
						}
						morph = {
							...morph,
							indices,
							positions,
							rotations
						};
					}
					break;
				case PmxObject.Morph.Type.UvMorph:
				case PmxObject.Morph.Type.AdditionalUvMorph1:
				case PmxObject.Morph.Type.AdditionalUvMorph2:
				case PmxObject.Morph.Type.AdditionalUvMorph3:
				case PmxObject.Morph.Type.AdditionalUvMorph4:
					{
						const indices = new Int32Array(morphOffsetCount);
						const offsets = new Float32Array(morphOffsetCount * 4);
						for (let i = 0; i < morphOffsetCount; ++i) {
							indices[i] = indexReader.getVertexIndex(dataDeserializer);
							offsets[i * 4 + 0] = dataDeserializer.getFloat32();
							offsets[i * 4 + 1] = dataDeserializer.getFloat32();
							offsets[i * 4 + 2] = dataDeserializer.getFloat32();
							offsets[i * 4 + 3] = dataDeserializer.getFloat32();
						}
						morph = {
							...morph,
							indices,
							offsets
						};
					}
					break;
				case PmxObject.Morph.Type.MaterialMorph:
					{
						const elements = [];
						for (let i = 0; i < morphOffsetCount; ++i) {
							const element = {
								index: indexReader.getMaterialIndex(dataDeserializer),
								type: dataDeserializer.getUint8(),
								diffuse: dataDeserializer.getFloat32Tuple(4),
								specular: dataDeserializer.getFloat32Tuple(3),
								shininess: dataDeserializer.getFloat32(),
								ambient: dataDeserializer.getFloat32Tuple(3),
								edgeColor: dataDeserializer.getFloat32Tuple(4),
								edgeSize: dataDeserializer.getFloat32(),
								textureColor: dataDeserializer.getFloat32Tuple(4),
								sphereTextureColor: dataDeserializer.getFloat32Tuple(4),
								toonTextureColor: dataDeserializer.getFloat32Tuple(4)
							};
							elements.push(element);
						}
						morph = {
							...morph,
							elements
						};
					}
					break;
				case PmxObject.Morph.Type.FlipMorph:
					{
						const indices = new Int32Array(morphOffsetCount);
						const ratios = new Float32Array(morphOffsetCount);
						for (let i = 0; i < morphOffsetCount; ++i) {
							indices[i] = indexReader.getMorphIndex(dataDeserializer);
							ratios[i] = dataDeserializer.getFloat32();
						}
						morph = {
							...morph,
							indices,
							ratios
						};
					}
					break;
				case PmxObject.Morph.Type.ImpulseMorph:
					{
						const indices = new Int32Array(morphOffsetCount);
						const isLocals = new Array(morphOffsetCount);
						const velocities = new Float32Array(morphOffsetCount * 3);
						const torques = new Float32Array(morphOffsetCount * 3);
						for (let i = 0; i < morphOffsetCount; ++i) {
							indices[i] = indexReader.getRigidBodyIndex(dataDeserializer);
							isLocals[i] = dataDeserializer.getUint8() === 1;
							velocities[i * 3 + 0] = dataDeserializer.getFloat32();
							velocities[i * 3 + 1] = dataDeserializer.getFloat32();
							velocities[i * 3 + 2] = dataDeserializer.getFloat32();
							torques[i * 3 + 0] = dataDeserializer.getFloat32();
							torques[i * 3 + 1] = dataDeserializer.getFloat32();
							torques[i * 3 + 2] = dataDeserializer.getFloat32();
						}
						morph = {
							...morph,
							indices,
							isLocals,
							velocities,
							torques
						};
					}
					break;
				default: throw new Error(`Unknown morph type: ${type}`);
			}
			morphs.push(morph);
		}
		return morphs;
	}
	static _ParseDisplayFrames(dataDeserializer, indexReader) {
		const displayFramesCount = dataDeserializer.getInt32();
		const displayFrames = [];
		for (let i = 0; i < displayFramesCount; ++i) {
			const name = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const englishName = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const isSpecialFrame = dataDeserializer.getUint8() === 1;
			const elementsCount = dataDeserializer.getInt32();
			const frames = [];
			for (let i = 0; i < elementsCount; ++i) {
				const frameType = dataDeserializer.getUint8();
				const frame = {
					type: frameType,
					index: frameType === PmxObject.DisplayFrame.FrameData.FrameType.Bone ? indexReader.getBoneIndex(dataDeserializer) : indexReader.getMorphIndex(dataDeserializer)
				};
				frames.push(frame);
			}
			const displayFrame = {
				name,
				englishName,
				isSpecialFrame,
				frames
			};
			displayFrames.push(displayFrame);
		}
		return displayFrames;
	}
	static _ParseRigidBodies(dataDeserializer, indexReader) {
		const rigidBodiesCount = dataDeserializer.getInt32();
		const rigidBodies = [];
		for (let i = 0; i < rigidBodiesCount; ++i) {
			const rigidBody = {
				name: dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false),
				englishName: dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false),
				boneIndex: indexReader.getBoneIndex(dataDeserializer),
				collisionGroup: dataDeserializer.getUint8(),
				collisionMask: dataDeserializer.getUint16(),
				shapeType: dataDeserializer.getUint8(),
				shapeSize: dataDeserializer.getFloat32Tuple(3),
				shapePosition: dataDeserializer.getFloat32Tuple(3),
				shapeRotation: dataDeserializer.getFloat32Tuple(3),
				mass: dataDeserializer.getFloat32(),
				linearDamping: dataDeserializer.getFloat32(),
				angularDamping: dataDeserializer.getFloat32(),
				repulsion: dataDeserializer.getFloat32(),
				friction: dataDeserializer.getFloat32(),
				physicsMode: dataDeserializer.getUint8()
			};
			rigidBodies.push(rigidBody);
		}
		return rigidBodies;
	}
	static _ParseJoints(dataDeserializer, indexReader) {
		const jointsCount = dataDeserializer.getInt32();
		const joints = [];
		for (let i = 0; i < jointsCount; ++i) {
			const joint = {
				name: dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false),
				englishName: dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false),
				type: dataDeserializer.getUint8(),
				rigidbodyIndexA: indexReader.getRigidBodyIndex(dataDeserializer),
				rigidbodyIndexB: indexReader.getRigidBodyIndex(dataDeserializer),
				position: dataDeserializer.getFloat32Tuple(3),
				rotation: dataDeserializer.getFloat32Tuple(3),
				positionMin: dataDeserializer.getFloat32Tuple(3),
				positionMax: dataDeserializer.getFloat32Tuple(3),
				rotationMin: dataDeserializer.getFloat32Tuple(3),
				rotationMax: dataDeserializer.getFloat32Tuple(3),
				springPosition: dataDeserializer.getFloat32Tuple(3),
				springRotation: dataDeserializer.getFloat32Tuple(3)
			};
			joints.push(joint);
		}
		return joints;
	}
	static _ParseSoftBodies(dataDeserializer, indexReader, header) {
		const softBodiesCount = dataDeserializer.getInt32();
		const softBodies = [];
		for (let i = 0; i < softBodiesCount; ++i) {
			const name = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const englishName = dataDeserializer.getDecoderString(dataDeserializer.getInt32(), false);
			const type = dataDeserializer.getUint8();
			const materialIndex = indexReader.getMaterialIndex(dataDeserializer);
			const collisionGroup = dataDeserializer.getUint8();
			const collisionMask = dataDeserializer.getUint16();
			const flags = dataDeserializer.getUint8();
			const bLinkDistance = dataDeserializer.getInt32();
			const clusterCount = dataDeserializer.getInt32();
			const totalMass = dataDeserializer.getFloat32();
			const collisionMargin = dataDeserializer.getFloat32();
			const aeroModel = dataDeserializer.getInt32();
			const config = {
				vcf: dataDeserializer.getFloat32(),
				dp: dataDeserializer.getFloat32(),
				dg: dataDeserializer.getFloat32(),
				lf: dataDeserializer.getFloat32(),
				pr: dataDeserializer.getFloat32(),
				vc: dataDeserializer.getFloat32(),
				df: dataDeserializer.getFloat32(),
				mt: dataDeserializer.getFloat32(),
				chr: dataDeserializer.getFloat32(),
				khr: dataDeserializer.getFloat32(),
				shr: dataDeserializer.getFloat32(),
				ahr: dataDeserializer.getFloat32()
			};
			const cluster = {
				srhrCl: dataDeserializer.getFloat32(),
				skhrCl: dataDeserializer.getFloat32(),
				sshrCl: dataDeserializer.getFloat32(),
				srSpltCl: dataDeserializer.getFloat32(),
				skSpltCl: dataDeserializer.getFloat32(),
				ssSpltCl: dataDeserializer.getFloat32()
			};
			const iteration = {
				vIt: dataDeserializer.getInt32(),
				pIt: dataDeserializer.getInt32(),
				dIt: dataDeserializer.getInt32(),
				cIt: dataDeserializer.getInt32()
			};
			const material = {
				lst: dataDeserializer.getInt32(),
				ast: dataDeserializer.getInt32(),
				vst: dataDeserializer.getInt32()
			};
			const anchorsCount = dataDeserializer.getInt32();
			const anchors = [];
			for (let j = 0; j < anchorsCount; ++j) {
				const anchorRigidBody = {
					rigidbodyIndex: indexReader.getRigidBodyIndex(dataDeserializer),
					vertexIndex: indexReader.getVertexIndex(dataDeserializer),
					isNearMode: dataDeserializer.getUint8() !== 0
				};
				anchors.push(anchorRigidBody);
			}
			const vertexPinCount = dataDeserializer.getInt32();
			const vertexPinArrayBuffer = new ArrayBuffer(vertexPinCount * header.vertexIndexSize);
			let vertexPins;
			switch (header.vertexIndexSize) {
				case 1:
					vertexPins = new Uint8Array(vertexPinArrayBuffer);
					break;
				case 2:
					vertexPins = new Uint16Array(vertexPinArrayBuffer);
					break;
				case 4:
					vertexPins = new Int32Array(vertexPinArrayBuffer);
					break;
				default: throw new Error(`Invalid vertexIndexSize: ${header.vertexIndexSize}`);
			}
			for (let i = 0; i < vertexPinCount; ++i) vertexPins[i] = indexReader.getVertexIndex(dataDeserializer);
			const softBody = {
				name,
				englishName,
				type,
				materialIndex,
				collisionGroup,
				collisionMask,
				flags,
				bLinkDistance,
				clusterCount,
				totalMass,
				collisionMargin,
				aeroModel,
				config,
				cluster,
				iteration,
				material,
				anchors,
				vertexPins
			};
			softBodies.push(softBody);
		}
		return softBodies;
	}
};
//#endregion
//#region src/materials/core/bindings.ts
/**
* Makes one object-level custom shadow material safe for meshes with multiple
* surface materials. WebGLShadowMap copies each group's alpha/displacement
* state onto the custom material, but keeps its identity. A distinct program
* cache key per surface forces WebGLRenderer to switch programs and upload
* that group's material uniforms before drawing it.
*/
const installShadowMaterialVariants = (material) => {
	const baseCacheKey = material.customProgramCacheKey.bind(material);
	let surfaceCacheKey = "";
	material.customProgramCacheKey = () => `${baseCacheKey()}|mmd-shadow-surface:${surfaceCacheKey}`;
	return (surface) => {
		const map = "map" in surface && surface.map instanceof Texture ? surface.map : void 0;
		surfaceCacheKey = `${surface.uuid}|map:${map?.uuid ?? "none"}|alpha-test:${String(surface.alphaTest > 0)}|side:${String(surface.side)}`;
		material.needsUpdate = true;
	};
};
const hasSdefVertices = (mesh) => {
	if (!mesh.geometry.hasAttribute("mmdSdefMask")) return false;
	const mask = mesh.geometry.getAttribute("mmdSdefMask");
	for (const value of mask.array) if (value !== 0) return true;
	return false;
};
/**
* Attaches MMD-only render passes to the loaded mesh.
*/
const installMMDMaterialBindings = (mesh) => {
	const surfaceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
	if (!surfaceMaterials.every(isMMDMaterial)) return;
	const mmdMaterials = surfaceMaterials;
	const meshHasSdefVertices = hasSdefVertices(mesh);
	for (const material of mmdMaterials) material.setSdefEnabled(meshHasSdefVertices);
	if (!meshHasSdefVertices) return;
	const depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
	const distanceMaterial = new MeshDistanceMaterial();
	installSdefPatch(depthMaterial);
	installSdefPatch(distanceMaterial);
	const setDepthSurface = installShadowMaterialVariants(depthMaterial);
	const setDistanceSurface = installShadowMaterialVariants(distanceMaterial);
	mesh.customDepthMaterial = depthMaterial;
	mesh.customDistanceMaterial = distanceMaterial;
	const previousOnBeforeShadow = mesh.onBeforeShadow;
	mesh.onBeforeShadow = (renderer, object, camera, shadowCamera, geometry, shadowMaterial, group) => {
		previousOnBeforeShadow.call(mesh, renderer, object, camera, shadowCamera, geometry, shadowMaterial, group);
		const surfaceIndex = group?.materialIndex ?? 0;
		const surface = mmdMaterials.at(surfaceIndex);
		if (surface === void 0) return;
		if (shadowMaterial === depthMaterial) setDepthSurface(surface);
		else if (shadowMaterial === distanceMaterial) setDistanceSurface(surface);
	};
};
//#endregion
//#region src/utils/_extract-model-extension.ts
const extractModelExtension = (buffer) => {
	const decoder = new TextDecoder("utf-8");
	const bytes = new Uint8Array(buffer, 0, 3);
	return decoder.decode(bytes).toLowerCase();
};
//#endregion
//#region src/utils/build-bones.ts
const buildBones = (pmx, mesh) => {
	const bones = pmx.bones.map((boneInfo) => {
		const bone = new Bone();
		bone.name = boneInfo.name;
		const pos = [...boneInfo.position];
		if (boneInfo.parentBoneIndex >= 0 && boneInfo.parentBoneIndex < pmx.bones.length) {
			const parentInfo = pmx.bones[boneInfo.parentBoneIndex];
			pos[0] -= parentInfo.position[0];
			pos[1] -= parentInfo.position[1];
			pos[2] -= parentInfo.position[2];
		}
		bone.position.fromArray(pos);
		return bone;
	});
	pmx.bones.forEach((boneInfo, i) => {
		if (boneInfo.parentBoneIndex >= 0 && boneInfo.parentBoneIndex < pmx.bones.length) bones[boneInfo.parentBoneIndex].add(bones[i]);
		else mesh.add(bones[i]);
	});
	mesh.updateMatrixWorld(true);
	const skeleton = new Skeleton(bones);
	mesh.bind(skeleton);
	return mesh;
};
//#endregion
//#region src/utils/build-geometry.ts
const buildGeometry = (pmx) => {
	const geometry = new BufferGeometry();
	const vertexCount = pmx.vertices.length;
	const positions = new Float32Array(vertexCount * 3);
	const normals = new Float32Array(vertexCount * 3);
	const uvs = new Float32Array(vertexCount * 2);
	const skinIndices = new Uint16Array(vertexCount * 4);
	const skinWeights = new Float32Array(vertexCount * 4);
	const sdefMask = new Float32Array(vertexCount);
	const sdefC = new Float32Array(vertexCount * 3);
	const sdefRW0 = new Float32Array(vertexCount * 3);
	const sdefRW1 = new Float32Array(vertexCount * 3);
	pmx.vertices.forEach((v, i) => {
		const position = [
			v.position[0],
			v.position[1],
			v.position[2]
		];
		const normal = [
			v.normal[0],
			v.normal[1],
			v.normal[2]
		];
		positions.set(position, i * 3);
		normals.set(normal, i * 3);
		uvs.set(v.uv, i * 2);
		switch (v.weightType) {
			case PmxObject.Vertex.BoneWeightType.Bdef1: {
				const bw = v.boneWeight;
				skinIndices.set([
					bw.boneIndices,
					0,
					0,
					0
				], i * 4);
				skinWeights.set([
					1,
					0,
					0,
					0
				], i * 4);
				break;
			}
			case PmxObject.Vertex.BoneWeightType.Bdef2: {
				const bw = v.boneWeight;
				skinIndices.set(bw.boneIndices, i * 4);
				skinWeights.set([
					bw.boneWeights,
					1 - bw.boneWeights,
					0,
					0
				], i * 4);
				break;
			}
			case PmxObject.Vertex.BoneWeightType.Bdef4:
			case PmxObject.Vertex.BoneWeightType.Qdef: {
				const bw = v.boneWeight;
				skinIndices.set(bw.boneIndices, i * 4);
				skinWeights.set(bw.boneWeights, i * 4);
				break;
			}
			case PmxObject.Vertex.BoneWeightType.Sdef: {
				const bw = v.boneWeight;
				skinIndices.set([
					bw.boneIndices[0],
					bw.boneIndices[1],
					0,
					0
				], i * 4);
				const sdefWeights = bw.boneWeights;
				const weight0 = sdefWeights.boneWeight0;
				const weight1 = 1 - weight0;
				skinWeights.set([
					weight0,
					weight1,
					0,
					0
				], i * 4);
				sdefMask[i] = 1;
				sdefC.set(sdefWeights.c, i * 3);
				for (let axis = 0; axis < 3; axis++) {
					const center = sdefWeights.c[axis];
					const r0 = sdefWeights.r0[axis];
					const r1 = sdefWeights.r1[axis];
					const weightedR = r0 * weight0 + r1 * weight1;
					sdefRW0[i * 3 + axis] = (center + center + r0 - weightedR) * .5;
					sdefRW1[i * 3 + axis] = (center + center + r1 - weightedR) * .5;
				}
				break;
			}
		}
	});
	geometry.setAttribute("position", new BufferAttribute(positions, 3));
	geometry.setAttribute("normal", new BufferAttribute(normals, 3));
	geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
	geometry.setAttribute("skinIndex", new BufferAttribute(skinIndices, 4));
	geometry.setAttribute("skinWeight", new BufferAttribute(skinWeights, 4));
	geometry.setAttribute("mmdSdefMask", new BufferAttribute(sdefMask, 1));
	geometry.setAttribute("mmdSdefC", new BufferAttribute(sdefC, 3));
	geometry.setAttribute("mmdSdefRW0", new BufferAttribute(sdefRW0, 3));
	geometry.setAttribute("mmdSdefRW1", new BufferAttribute(sdefRW1, 3));
	const indices = Array.from(pmx.indices);
	geometry.setIndex(indices);
	let faceIndex = 0;
	for (const material of pmx.materials) {
		geometry.addGroup(faceIndex, material.indexCount, pmx.materials.indexOf(material));
		faceIndex += material.indexCount;
	}
	const morphPositions = [];
	const updateAttributes = (attribute, morph, ratio) => {
		for (let i = 0; i < morph.indices.length; i++) {
			const index = morph.indices[i];
			attribute.array[index * 3 + 0] += morph.positions[i * 3 + 0] * ratio;
			attribute.array[index * 3 + 1] += morph.positions[i * 3 + 1] * ratio;
			attribute.array[index * 3 + 2] += morph.positions[i * 3 + 2] * ratio;
		}
	};
	for (const morph of pmx.morphs) {
		const attribute = new BufferAttribute(positions.slice(), 3);
		attribute.name = morph.name;
		if (morph.type === PmxObject.Morph.Type.GroupMorph) for (let i = 0; i < morph.indices.length; i++) {
			const targetIndex = morph.indices[i];
			const ratio = morph.ratios[i];
			if (targetIndex < 0 || targetIndex >= pmx.morphs.length) {
				console.warn(`buildGeometry: Group morph "${morph.name}" references invalid morph index ${targetIndex}; skipping.`);
				continue;
			}
			const targetMorph = pmx.morphs[targetIndex];
			if (targetMorph.type === PmxObject.Morph.Type.GroupMorph) {
				console.warn(`buildGeometry: Group morph "${morph.name}" references group morph index ${targetIndex}; skipping unsupported nesting.`);
				continue;
			}
			if (targetMorph.type === PmxObject.Morph.Type.VertexMorph) updateAttributes(attribute, targetMorph, ratio);
		}
		else if (morph.type === PmxObject.Morph.Type.VertexMorph) updateAttributes(attribute, morph, 1);
		morphPositions.push(attribute);
	}
	if (morphPositions.length > 0) {
		geometry.morphAttributes.position = morphPositions;
		geometry.morphTargetsRelative = false;
	}
	geometry.computeBoundingSphere();
	return geometry;
};
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/sharedToonTextures.js
/**
* Toon texture that exists as a kind of constant
*/
var SharedToonTextures = class {
	/**
	* Shared toon textures data (base64)
	*/
	static Data = [
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVRYR+3QQREAAAzCsOFfNJPBJ1XQS9r2hsUAAQIECBAgQIAAAQIECBAgsBZ4MUx/ofm2I/kAAAAASUVORK5CYII=",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAN0lEQVRYR+3WQREAMBACsZ5/bWiiMvgEBTt5cW37hjsBBAgQIECAwFwgyfYPCCBAgAABAgTWAh8aBHZBl14e8wAAAABJRU5ErkJggg==",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOUlEQVRYR+3WMREAMAwDsYY/yoDI7MLwIiP40+RJklfcCCBAgAABAgTqArfb/QMCCBAgQIAAgbbAB3z/e0F3js2cAAAAAElFTkSuQmCC",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAN0lEQVRYR+3WQREAMBACsZ5/B5ilMvgEBTt5cW37hjsBBAgQIECAwFwgyfYPCCBAgAABAgTWAh81dWyx0gFwKAAAAABJRU5ErkJggg==",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVRYR+3WoREAMAwDsWb/UQtCy9wxTOQJ/oQ8SXKKGwEECBAgQIBAXeDt7f4BAQQIECBAgEBb4AOz8Hzx7WLY4wAAAABJRU5ErkJggg==",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABPUlEQVRYR+1XwW7CMAy1+f9fZOMysSEOEweEOPRNdm3HbdOyIhAcklPrOs/PLy9RygBALxzcCDQFmgJNgaZAU6Ap0BR4PwX8gsRMVLssMRH5HcpzJEaWL7EVg9F1IHRlyqQohgVr4FGUlUcMJSjcUlDw0zvjeun70cLWmneoyf7NgBTQSniBTQQSuJAZsOnnaczjIMb5hCiuHKxokCrJfVnrctyZL0PkJAJe1HMil4nxeyi3Ypfn1kX51jpPvo/JeCNC4PhVdHdJw2XjBR8brF8PEIhNVn12AgP7uHsTBguBn53MUZCqv7Lp07Pn5k1Ro+uWmUNn7D+M57rtk7aG0Vo73xyF/fbFf0bPJjDXngnGocDTdFhygZjwUQrMNrDcmZlQT50VJ/g/UwNyHpu778+yW+/ksOz/BFo54P4AsUXMfRq7XWsAAAAASUVORK5CYII=",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACMElEQVRYR+2Xv4pTQRTGf2dubhLdICiii2KnYKHVolhauKWPoGAnNr6BD6CvIVaihYuI2i1ia0BY0MZGRHQXjZj/mSPnnskfNWiWZUlzJ5k7M2cm833nO5Mziej2DWWJRUoCpQKlAntSQCqgw39/iUWAGmh37jrRnVsKlgpiqmkoGVABA7E57fvY+pJDdgKqF6HzFCSADkDq+F6AHABtQ+UMVE5D7zXod7fFNhTEckTbj5XQgHzNN+5tQvc5NG7C6BNkp6D3EmpXHDR+dQAjFLchW3VS9rlw3JBh+B7ys5Cf9z0GW1C/7P32AyBAOAz1q4jGliIH3YPuBnSfQX4OGreTIgEYQb/pBDtPnEQ4CivXYPAWBk13oHrB54yA9QuSn2H4AcKRpEILDt0BUzj+RLR1V5EqjD66NPRBVpLcQwjHoHYJOhsQv6U4mnzmrIXJCFr4LDwm/xBUoboG9XX4cc9VKdYoSA2yk5NQLJaKDUjTBoveG3Z2TElTxwjNK4M3LEZgUdDdruvcXzKBpStgp2NPiWi3ks9ZXxIoFVi+AvHLdc9TqtjL3/aYjpPlrzOcEnK62Szhimdd7xX232zFDTgtxezOu3WNMRLjiKgjtOhHVMd1loynVHvOgjuIIJMaELEqhJAV/RCSLbWTcfPFakFgFlALTRRvx+ok6Hlp/Q+v3fmx90bMyUzaEAhmM3KvHlXTL5DxnbGf/1M8RNNACLL5MNtPxP/mypJAqcDSFfgFhpYqWUzhTEAAAAAASUVORK5CYII=",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVRYR+3QQREAAAzCsOFfNJPBJ1XQS9r2hsUAAQIECBAgQIAAAQIECBAgsBZ4MUx/ofm2I/kAAAAASUVORK5CYII=",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVRYR+3QQREAAAzCsOFfNJPBJ1XQS9r2hsUAAQIECBAgQIAAAQIECBAgsBZ4MUx/ofm2I/kAAAAASUVORK5CYII=",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVRYR+3QQREAAAzCsOFfNJPBJ1XQS9r2hsUAAQIECBAgQIAAAQIECBAgsBZ4MUx/ofm2I/kAAAAASUVORK5CYII=",
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVRYR+3QQREAAAzCsOFfNJPBJ1XQS9r2hsUAAQIECBAgQIAAAQIECBAgsBZ4MUx/ofm2I/kAAAAASUVORK5CYII="
	];
};
//#endregion
//#region src/utils/build-material/types.ts
const NON_ALPHA_CHANNEL_FORMATS = [
	RGB_S3TC_DXT1_Format,
	RGB_PVRTC_4BPPV1_Format,
	RGB_PVRTC_2BPPV1_Format,
	RGB_ETC1_Format,
	RGB_ETC2_Format
];
//#endregion
//#region src/utils/build-material/utils.ts
const checkImageTransparency = (map, geometry, groupIndex, onAlphaMode) => {
	map.readyCallbacks.push((texture) => {
		const createImageData = (image) => {
			const canvas = document.createElement("canvas");
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext("2d");
			context.drawImage(image, 0, 0);
			return context.getImageData(0, 0, canvas.width, canvas.height);
		};
		const detectImageAlphaMode = (image, uvs, indices) => {
			const width = image.width;
			const height = image.height;
			const data = image.data;
			const alphaValues = [];
			const getAlphaByUv = (image, uv) => {
				const width = image.width;
				const height = image.height;
				let x = Math.round(uv.x * width) % width;
				let y = Math.round(uv.y * height) % height;
				if (x < 0) x += width;
				if (y < 0) y += height;
				const index = y * width + x;
				return image.data[index * 4 + 3];
			};
			if (data.length / (width * height) !== 4) return void 0;
			for (let i = 0; i < indices.length; i += 3) {
				const uv0 = {
					x: uvs[indices[i] * 2 + 0],
					y: uvs[indices[i] * 2 + 1]
				};
				const uv1 = {
					x: uvs[indices[i + 1] * 2 + 0],
					y: uvs[indices[i + 1] * 2 + 1]
				};
				const uv2 = {
					x: uvs[indices[i + 2] * 2 + 0],
					y: uvs[indices[i + 2] * 2 + 1]
				};
				for (let u = 0; u <= 3; u++) for (let v = 0; v <= 3 - u; v++) {
					const w = 3 - u - v;
					alphaValues.push(getAlphaByUv(image, {
						x: (uv0.x * u + uv1.x * v + uv2.x * w) / 3,
						y: (uv0.y * u + uv1.y * v + uv2.y * w) / 3
					}));
				}
			}
			return resolveMMDTextureAlphaMode(alphaValues);
		};
		if ("isCompressedTexture" in texture && texture.isCompressedTexture === true) {
			if (!NON_ALPHA_CHANNEL_FORMATS.includes(texture.format)) onAlphaMode?.("blend");
			return;
		}
		const image = texture.image;
		const imageData = "data" in image ? image : createImageData(image);
		const group = geometry.groups[groupIndex];
		const alphaMode = detectImageAlphaMode(imageData, geometry.attributes.uv.array, geometry.index.array.slice(group.start, group.start + group.count));
		if (alphaMode !== void 0) onAlphaMode?.(alphaMode);
	});
};
const getRotatedImage = (image) => {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	const width = image.width;
	const height = image.height;
	canvas.width = width;
	canvas.height = height;
	context.clearRect(0, 0, width, height);
	context.translate(width / 2, height / 2);
	context.rotate(.5 * Math.PI);
	context.translate(-width / 2, -height / 2);
	context.drawImage(image, 0, 0);
	return context.getImageData(0, 0, width, height);
};
const loadTextureResource = (filePath, ctx, params = {}) => {
	let fullPath;
	if (params.isDefaultToonTexture === true) {
		let index;
		try {
			index = Number.parseInt(/toon(\d{2})\.bmp$/.exec(filePath)[1]);
		} catch {
			console.warn(`MMDLoader: ${filePath} seems like a not right default texture path. Using toon00.bmp instead.`);
			index = 0;
		}
		fullPath = SharedToonTextures.Data[index];
	} else fullPath = LoaderUtils.resolveURL(filePath, ctx.resourcePath);
	if (ctx.textures[fullPath] != null) return ctx.textures[fullPath];
	let loader = ctx.manager.getHandler(fullPath);
	if (loader === null) loader = filePath.slice(-4).toLowerCase() === ".tga" ? ctx.getTGALoader() : ctx.textureLoader;
	const texture = loader.load(fullPath, (t) => {
		if (params.isToonTexture === true) {
			t.image = getRotatedImage(t.image);
			t.magFilter = NearestFilter;
			t.minFilter = NearestFilter;
			t.generateMipmaps = false;
		}
		t.flipY = false;
		t.wrapS = RepeatWrapping;
		t.wrapT = RepeatWrapping;
		t.colorSpace = SRGBColorSpace;
		for (let i = 0; i < texture.readyCallbacks.length; i++) texture.readyCallbacks[i](texture);
		delete texture.readyCallbacks;
	}, ctx.onProgress, ctx.onError);
	texture.readyCallbacks = [];
	ctx.textures[fullPath] = texture;
	return texture;
};
//#endregion
//#region src/utils/build-material/index.ts
const isPmxMaterialDoubleSided = (flag) => (flag & PmxObject.Material.Flag.IsDoubleSided) !== 0;
const mapPmxToMaterialDescriptor = (material, pmxTextures, geometry, ctx, groupIndex, onAlphaMode, textureCapabilities) => {
	const diffuse = new Color().setRGB(material.diffuse[0], material.diffuse[1], material.diffuse[2], SRGBColorSpace);
	const opacity = material.diffuse[3];
	const mapFileName = material.textureIndex === -1 ? void 0 : pmxTextures[material.textureIndex];
	const map = mapFileName === void 0 ? void 0 : loadTextureResource(mapFileName, ctx);
	const sphereMapFileName = material.sphereTextureIndex === -1 ? void 0 : pmxTextures[material.sphereTextureIndex];
	const sphereBlendMode = material.sphereTextureMode === PmxObject.Material.SphereTextureMode.Multiply ? "multiply" : material.sphereTextureMode === PmxObject.Material.SphereTextureMode.Add ? "add" : void 0;
	const sphereMap = (textureCapabilities === void 0 || sphereBlendMode !== void 0 && textureCapabilities.sphereTexture.includes(sphereBlendMode)) && sphereMapFileName !== void 0 && sphereBlendMode !== void 0 ? loadTextureResource(sphereMapFileName, ctx) : void 0;
	const isDefaultToonTexture = material.isSharedToonTexture || material.toonTextureIndex === -1;
	const toonMapFileName = isDefaultToonTexture ? `toon${`0${material.toonTextureIndex + 1}`.slice(-2)}.bmp` : pmxTextures[material.toonTextureIndex];
	const descriptor = {
		ambient: new Color().setRGB(...material.ambient, SRGBColorSpace),
		diffuse,
		doubleSided: isPmxMaterialDoubleSided(material.flag),
		fog: true,
		isDefaultToonTexture,
		map,
		mapFileName,
		name: material.name,
		opacity,
		outline: {
			alpha: material.edgeColor[3],
			color: new Color().setRGB(material.edgeColor[0], material.edgeColor[1], material.edgeColor[2], SRGBColorSpace),
			visible: (material.flag & PmxObject.Material.Flag.EnabledToonEdge) !== 0 && material.edgeSize > 0,
			width: material.edgeSize / 300
		},
		shininess: material.shininess,
		specular: new Color().setRGB(...material.specular, SRGBColorSpace),
		sphereBlendMode,
		sphereMap,
		sphereMapFileName,
		toonMap: textureCapabilities === void 0 || textureCapabilities.toon ? loadTextureResource(toonMapFileName, ctx, {
			isDefaultToonTexture,
			isToonTexture: true
		}) : void 0,
		toonMapFileName
	};
	if (map !== void 0 && opacity === 1) checkImageTransparency(map, geometry, groupIndex, (mode) => {
		descriptor.textureAlphaMode = mode;
		onAlphaMode?.(mode);
	});
	return descriptor;
};
const applyMorphTransparencyFix = (materials, morphs) => {
	const checkAlphaMorph = (elements, targetMaterials) => {
		for (const element of elements) {
			const material = element.index === -1 ? void 0 : targetMaterials[element.index];
			if (material === void 0 || material.opacity === element.diffuse[3]) continue;
			if (isMMDMaterial(material)) material.setMMDAlphaMorphEnabled(true);
			else material.transparent = true;
		}
	};
	for (const morph of morphs) if (morph.type === PmxObject.Morph.Type.GroupMorph) for (const index of morph.indices) {
		const child = morphs[index];
		if (child?.type === PmxObject.Morph.Type.MaterialMorph) checkAlphaMorph(child.elements, materials);
	}
	else if (morph.type === PmxObject.Morph.Type.MaterialMorph) checkAlphaMorph(morph.elements, materials);
};
const buildMaterial = (data, geometry, resourcePath, customManager, materialType = MMDToonMaterial, onProgress, onError) => {
	const manager = customManager ?? DefaultLoadingManager;
	const textureLoader = new TextureLoader(manager);
	textureLoader.setCrossOrigin("anonymous");
	let tgaLoader;
	const ctx = {
		getTGALoader: () => tgaLoader ??= new TGALoader(manager),
		manager,
		onError,
		onProgress,
		resourcePath,
		textureLoader,
		textures: {}
	};
	const materials = [];
	const textureCapabilities = materialType.mmdCapabilities;
	const descriptors = data.materials.map((pmxMaterial, index) => mapPmxToMaterialDescriptor(pmxMaterial, data.textures, geometry, ctx, index, (mode) => materials[index]?.setMMDTextureAlphaMode(mode), textureCapabilities === void 0 ? void 0 : {
		sphereTexture: textureCapabilities.sphereTexture,
		toon: textureCapabilities.toon
	}));
	const MaterialType = materialType;
	for (const descriptor of descriptors) materials.push(new MaterialType(descriptor));
	applyMorphTransparencyFix(materials, data.morphs);
	return materials;
};
//#endregion
//#region src/physics/grant-solver.ts
/** @internal */
var GrantSolver = class {
	mesh;
	appendQuaternion = new Quaternion();
	appliedPoses = /* @__PURE__ */ new Map();
	entries;
	entriesByIndex;
	identityQuaternion = new Quaternion();
	ikRotations;
	restPositions;
	skinMatrix = new Matrix4();
	sourceRotation = new Quaternion();
	worldPosition = new Vector3();
	worldQuaternion = new Quaternion();
	worldScale = new Vector3();
	constructor(mesh, pmx, ikRotations) {
		this.mesh = mesh;
		const bones = mesh.skeleton.bones;
		if (bones.length < pmx.bones.length) throw new RangeError(`GrantSolver: skeleton has ${bones.length} bones, but PMX contains ${pmx.bones.length}.`);
		if (mesh.skeleton.boneInverses.length < pmx.bones.length) throw new RangeError(`GrantSolver: skeleton has ${mesh.skeleton.boneInverses.length} inverse bind matrices, but PMX contains ${pmx.bones.length} bones.`);
		this.ikRotations = ikRotations ?? Array.from({ length: pmx.bones.length }, () => new Quaternion());
		if (this.ikRotations.length < pmx.bones.length) throw new RangeError(`GrantSolver: IK rotation state has ${this.ikRotations.length} entries, but PMX contains ${pmx.bones.length} bones.`);
		this.restPositions = bones.map((bone) => bone.position.clone());
		this.entriesByIndex = Array.from({ length: pmx.bones.length });
		this.entries = [];
		pmx.bones.forEach((bone, index) => {
			const appendTransform = bone.appendTransform;
			if (appendTransform === void 0) return;
			const parentIndex = appendTransform.parentIndex;
			if (!Number.isInteger(parentIndex) || parentIndex < 0 || parentIndex >= pmx.bones.length || parentIndex >= bones.length) throw new RangeError(`GrantSolver: invalid append source index ${parentIndex} for bone ${index}.`);
			const flags = bone.flag;
			const affectRotation = (flags & PmxObject.Bone.Flag.HasAppendRotate) !== 0;
			const affectPosition = (flags & PmxObject.Bone.Flag.HasAppendMove) !== 0;
			if (!affectRotation && !affectPosition) return;
			const entry = {
				affectPosition,
				affectRotation,
				appendPosition: new Vector3(),
				appendRotation: new Quaternion(),
				index,
				isLocal: (flags & PmxObject.Bone.Flag.LocalAppendTransform) !== 0,
				parentIndex,
				processed: false,
				ratio: appendTransform.ratio,
				transformOrder: bone.transformOrder
			};
			this.entries.push(entry);
			this.entriesByIndex[index] = entry;
		});
		this.entries.sort((a, b) => a.transformOrder - b.transformOrder || a.index - b.index);
	}
	/** Restores unchanged output and captures the input for both physics stages. */
	beginFrame() {
		const bones = this.mesh.skeleton.bones;
		for (const [index, pose] of this.appliedPoses) {
			const bone = bones[index];
			if (bone.position.equals(pose.outputPosition)) bone.position.copy(pose.basePosition);
			if (bone.quaternion.equals(pose.outputRotation)) bone.quaternion.copy(pose.baseRotation);
		}
		this.reset();
		for (const entry of this.entries) {
			const bone = bones[entry.index];
			this.appliedPoses.set(entry.index, {
				basePosition: bone.position.clone(),
				baseRotation: bone.quaternion.clone(),
				outputPosition: bone.position.clone(),
				outputRotation: bone.quaternion.clone()
			});
		}
	}
	/** Records the final output after all bone transforms and physics have run. */
	endFrame() {
		const bones = this.mesh.skeleton.bones;
		for (const [index, pose] of this.appliedPoses) {
			pose.outputPosition.copy(bones[index].position);
			pose.outputRotation.copy(bones[index].quaternion);
		}
	}
	/** Discards frame state when an explicit animation pose replaces the output. */
	reset() {
		this.appliedPoses.clear();
		for (const entry of this.entries) {
			entry.appendPosition.set(0, 0, 0);
			entry.appendRotation.identity();
			entry.processed = false;
		}
	}
	/** Applies all append transforms once to the current animated/IK pose. */
	update() {
		this.beginFrame();
		this.mesh.updateMatrixWorld(true);
		for (const entry of this.entries) this.updateBone(entry.index);
		this.mesh.updateMatrixWorld(true);
		this.endFrame();
		return this;
	}
	/** Applies one append transform before the IK attached to that bone. */
	updateBone(boneIndex) {
		const entry = this.entriesByIndex[boneIndex];
		if (entry === void 0) return;
		const bones = this.mesh.skeleton.bones;
		const bone = bones[entry.index];
		const positionOffset = bone.position.clone().sub(this.restPositions[entry.index]);
		const rotation = bone.quaternion.clone();
		if (entry.affectRotation) {
			const sourceRotation = this.getSourceRotation(entry, bones);
			this.appendQuaternion.copy(this.identityQuaternion).slerp(sourceRotation, entry.ratio);
			rotation.multiply(this.appendQuaternion);
			entry.appendRotation.copy(rotation);
		}
		if (entry.affectPosition) {
			const sourcePosition = this.getSourcePosition(entry, bones);
			positionOffset.addScaledVector(sourcePosition, entry.ratio);
			entry.appendPosition.copy(positionOffset);
		}
		bone.quaternion.copy(rotation);
		bone.position.copy(this.restPositions[entry.index]).add(positionOffset);
		bone.updateMatrixWorld(true);
		entry.processed = true;
	}
	getSourcePosition(entry, bones) {
		const sourceEntry = this.entriesByIndex[entry.parentIndex];
		if (!entry.isLocal) {
			if (sourceEntry?.affectPosition && !sourceEntry.processed) return sourceEntry.appendPosition;
			return this.worldPosition.copy(bones[entry.parentIndex].position).sub(this.restPositions[entry.parentIndex]);
		}
		const sourceBone = bones[entry.parentIndex];
		const inverseBindMatrix = this.mesh.skeleton.boneInverses[entry.parentIndex];
		this.skinMatrix.copy(sourceBone.matrixWorld).multiply(inverseBindMatrix);
		return this.worldPosition.setFromMatrixPosition(this.skinMatrix);
	}
	getSourceRotation(entry, bones) {
		const sourceEntry = this.entriesByIndex[entry.parentIndex];
		if (!entry.isLocal) {
			if (sourceEntry?.affectRotation && !sourceEntry.processed) return this.sourceRotation.copy(sourceEntry.appendRotation).premultiply(this.ikRotations[entry.parentIndex]);
			return bones[entry.parentIndex].quaternion;
		}
		bones[entry.parentIndex].matrixWorld.decompose(this.worldPosition, this.worldQuaternion, this.worldScale);
		return this.worldQuaternion;
	}
};
//#endregion
//#region src/physics/mmd-ik-helper.ts
/** Visualizes the target, effector, links, and chain of every PMX IK solver. */
var MMDIKHelper = class extends Object3D {
	effectorSphereMaterial;
	lineMaterial;
	linkSphereMaterial;
	root;
	sphereGeometry;
	targetSphereMaterial;
	bonePosition = new Vector3();
	matrixWorldInverse = new Matrix4();
	visuals = [];
	constructor(mesh, pmx, sphereSize = .25) {
		super();
		this.root = mesh;
		this.matrix.copy(mesh.matrixWorld);
		this.matrixAutoUpdate = false;
		this.sphereGeometry = new SphereGeometry(sphereSize, 16, 8);
		this.targetSphereMaterial = new MeshBasicMaterial({
			color: new Color(16746632),
			depthTest: false,
			depthWrite: false,
			transparent: true
		});
		this.effectorSphereMaterial = new MeshBasicMaterial({
			color: new Color(8978312),
			depthTest: false,
			depthWrite: false,
			transparent: true
		});
		this.linkSphereMaterial = new MeshBasicMaterial({
			color: new Color(8947967),
			depthTest: false,
			depthWrite: false,
			transparent: true
		});
		this.lineMaterial = new LineBasicMaterial({
			color: new Color(16711680),
			depthTest: false,
			depthWrite: false,
			transparent: true
		});
		const entries = [];
		pmx.bones.forEach((bone, targetBoneIndex) => {
			if (bone.ik === void 0) return;
			this.validateBoneIndex(targetBoneIndex, "target");
			this.validateBoneIndex(bone.ik.target, `effector for target ${targetBoneIndex}`);
			bone.ik.links.forEach((link, linkIndex) => this.validateBoneIndex(link.target, `link ${linkIndex} for target ${targetBoneIndex}`));
			entries.push({
				effectorBoneIndex: bone.ik.target,
				linkBoneIndices: bone.ik.links.map((link) => link.target),
				targetBoneIndex,
				transformOrder: bone.transformOrder
			});
		});
		entries.sort((a, b) => a.transformOrder - b.transformOrder || a.targetBoneIndex - b.targetBoneIndex);
		this.initialize(entries);
	}
	/** Frees the GPU resources allocated by this helper. */
	dispose() {
		this.sphereGeometry.dispose();
		this.targetSphereMaterial.dispose();
		this.effectorSphereMaterial.dispose();
		this.linkSphereMaterial.dispose();
		this.lineMaterial.dispose();
		for (const visual of this.visuals) visual.line.geometry.dispose();
	}
	updateMatrixWorld(force) {
		const mesh = this.root;
		if (this.visible) {
			this.matrixWorldInverse.copy(mesh.matrixWorld).invert();
			for (const visual of this.visuals) {
				const { entry } = visual;
				const bones = mesh.skeleton.bones;
				this.setObjectPosition(visual.targetMesh, bones[entry.targetBoneIndex]);
				this.setObjectPosition(visual.effectorMesh, bones[entry.effectorBoneIndex]);
				this.writeBonePosition(visual.positionAttribute, 0, bones[entry.targetBoneIndex]);
				this.writeBonePosition(visual.positionAttribute, 1, bones[entry.effectorBoneIndex]);
				entry.linkBoneIndices.forEach((boneIndex, linkIndex) => {
					this.setObjectPosition(visual.linkMeshes[linkIndex], bones[boneIndex]);
					this.writeBonePosition(visual.positionAttribute, linkIndex + 2, bones[boneIndex]);
				});
				visual.positionAttribute.needsUpdate = true;
			}
		}
		this.matrix.copy(mesh.matrixWorld);
		super.updateMatrixWorld(force);
	}
	initialize(entries) {
		for (const entry of entries) {
			const targetMesh = new Mesh(this.sphereGeometry, this.targetSphereMaterial);
			const effectorMesh = new Mesh(this.sphereGeometry, this.effectorSphereMaterial);
			const linkMeshes = entry.linkBoneIndices.map(() => new Mesh(this.sphereGeometry, this.linkSphereMaterial));
			const lineGeometry = new BufferGeometry();
			const positionAttribute = new BufferAttribute(new Float32Array((2 + entry.linkBoneIndices.length) * 3), 3);
			lineGeometry.setAttribute("position", positionAttribute);
			const line = new Line(lineGeometry, this.lineMaterial);
			line.frustumCulled = false;
			this.add(targetMesh, effectorMesh, ...linkMeshes, line);
			this.visuals.push({
				effectorMesh,
				entry,
				line,
				linkMeshes,
				positionAttribute,
				targetMesh
			});
		}
	}
	setObjectPosition(object, bone) {
		object.position.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(this.matrixWorldInverse);
	}
	validateBoneIndex(index, description) {
		if (Number.isInteger(index) && index >= 0 && index < this.root.skeleton.bones.length) return;
		throw new RangeError(`MMDIKHelper: invalid ${description} bone index ${index}.`);
	}
	writeBonePosition(attribute, index, bone) {
		this.bonePosition.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(this.matrixWorldInverse);
		attribute.setXYZ(index, this.bonePosition.x, this.bonePosition.y, this.bonePosition.z);
	}
};
//#endregion
//#region src/physics/mmd-ik-solver.ts
/** @internal */
var MMDIKSolver = class {
	mesh;
	appliedPoses = /* @__PURE__ */ new Map();
	axis = new Vector3();
	chainIkVector = new Vector3();
	chainPosition = new Vector3();
	chainRotationAxis = new Vector3();
	chainTargetVector = new Vector3();
	entries;
	entriesByBoneIndex = /* @__PURE__ */ new Map();
	ikPosition = new Vector3();
	ikRotations;
	inverseParentRotation = new Quaternion();
	invertedLocalRotation = new Quaternion();
	parentRotation = new Matrix4();
	pmx;
	rotation = new Quaternion();
	rotation2 = new Quaternion();
	rotationMatrix = new Matrix4();
	targetPosition = new Vector3();
	xAxis = new Vector3(1, 0, 0);
	yAxis = new Vector3(0, 1, 0);
	zAxis = new Vector3(0, 0, 1);
	constructor(mesh, pmx, ikRotations) {
		this.mesh = mesh;
		this.pmx = pmx;
		const bones = mesh.skeleton.bones;
		if (bones.length < pmx.bones.length) throw new RangeError(`MMDIKSolver: skeleton has ${bones.length} bones, but PMX contains ${pmx.bones.length}.`);
		this.ikRotations = ikRotations ?? Array.from({ length: pmx.bones.length }, () => new Quaternion());
		if (this.ikRotations.length < pmx.bones.length) throw new RangeError(`MMDIKSolver: IK rotation state has ${this.ikRotations.length} entries, but PMX contains ${pmx.bones.length} bones.`);
		const physicsBoneIndices = this.buildPhysicsBoneIndices(pmx);
		const entries = [];
		pmx.bones.forEach((boneMetadata, boneIndex) => {
			const ik = boneMetadata.ik;
			if (ik === void 0) return;
			this.validateBoneIndex(ik.target, pmx.bones.length, bones.length, `IK target for bone ${boneIndex}`);
			const targetBone = bones[ik.target];
			const chains = ik.links.map((link, chainIndex) => {
				this.validateBoneIndex(link.target, pmx.bones.length, bones.length, `IK link ${chainIndex} for bone ${boneIndex}`);
				const chainBone = bones[link.target];
				const limitation = link.limitation;
				let minimumAngle = null;
				let maximumAngle = null;
				let rotationOrder = "XZY";
				let solveAxis = "none";
				if (limitation !== void 0) {
					const minimum = limitation.minimumAngle;
					const maximum = limitation.maximumAngle;
					minimumAngle = new Vector3(Math.min(minimum[0], maximum[0]), Math.min(minimum[1], maximum[1]), Math.min(minimum[2], maximum[2]));
					maximumAngle = new Vector3(Math.max(minimum[0], maximum[0]), Math.max(minimum[1], maximum[1]), Math.max(minimum[2], maximum[2]));
					const halfPi = Math.PI * .5;
					if (-halfPi < minimumAngle.x && maximumAngle.x < halfPi) rotationOrder = "YXZ";
					else if (-halfPi < minimumAngle.y && maximumAngle.y < halfPi) rotationOrder = "ZYX";
					if (minimumAngle.x === 0 && maximumAngle.x === 0 && minimumAngle.y === 0 && maximumAngle.y === 0 && minimumAngle.z === 0 && maximumAngle.z === 0) solveAxis = "fixed";
					else if (minimumAngle.y === 0 && maximumAngle.y === 0 && minimumAngle.z === 0 && maximumAngle.z === 0) solveAxis = "x";
					else if (minimumAngle.x === 0 && maximumAngle.x === 0 && minimumAngle.z === 0 && maximumAngle.z === 0) solveAxis = "y";
					else if (minimumAngle.x === 0 && maximumAngle.x === 0 && minimumAngle.y === 0 && maximumAngle.y === 0) solveAxis = "z";
				}
				return {
					bone: chainBone,
					boneIndex: link.target,
					ikRotation: this.ikRotations[link.target],
					localRotation: new Quaternion(),
					maximumAngle,
					minimumAngle,
					physicsControlled: physicsBoneIndices.has(link.target),
					rotationOrder,
					solveAxis
				};
			});
			this.warnAboutUnexpectedTopology(targetBone, chains);
			const entry = {
				boneIndex,
				canSkipForPhysics: chains.length > 0 && chains.every((chain) => chain.physicsControlled),
				chains,
				enabled: true,
				ikBone: bones[boneIndex],
				iteration: Math.min(ik.iteration, 256),
				limitAngle: ik.rotationConstraint,
				targetBone,
				transformOrder: boneMetadata.transformOrder
			};
			entries.push(entry);
			this.entriesByBoneIndex.set(boneIndex, entry);
		});
		entries.sort((a, b) => a.transformOrder - b.transformOrder || a.boneIndex - b.boneIndex);
		this.entries = entries;
	}
	/** Restores unchanged output and captures chain input for both physics stages. */
	beginFrame() {
		const bones = this.mesh.skeleton.bones;
		for (const [boneIndex, pose] of this.appliedPoses) {
			const bone = bones[boneIndex];
			if (bone.quaternion.equals(pose.outputRotation)) bone.quaternion.copy(pose.baseRotation);
		}
		this.reset();
		for (const entry of this.entries) for (const chain of entry.chains) if (!this.appliedPoses.has(chain.boneIndex)) this.appliedPoses.set(chain.boneIndex, {
			baseRotation: chain.bone.quaternion.clone(),
			outputRotation: chain.bone.quaternion.clone()
		});
	}
	/** Creates a helper that visualizes every PMX IK chain. */
	createHelper(sphereSize = .25) {
		return new MMDIKHelper(this.mesh, this.pmx, sphereSize);
	}
	/** Records the final output after all bone transforms and physics have run. */
	endFrame() {
		const bones = this.mesh.skeleton.bones;
		for (const [boneIndex, pose] of this.appliedPoses) pose.outputRotation.copy(bones[boneIndex].quaternion);
	}
	/** Returns whether the IK definition attached to a PMX bone is enabled. */
	isEnabled(ikBoneIndex) {
		return this.getEntry(ikBoneIndex).enabled;
	}
	/** Discards frame state when an explicit animation pose replaces the output. */
	reset() {
		this.appliedPoses.clear();
		for (const rotation of this.ikRotations) rotation.identity();
	}
	/** Enables or disables the IK definition attached to a PMX bone. */
	setEnabled(ikBoneIndex, enabled) {
		this.getEntry(ikBoneIndex).enabled = enabled;
		return this;
	}
	/**
	* Solves every enabled PMX IK definition against the current bone pose.
	*
	* `delta` is reserved for parity with the model update lifecycle. The
	* current CCD calculation is frame-rate independent.
	*
	* @param delta Elapsed time in seconds.
	* @param physicsAffectsIK Whether PMX rigid-body-controlled chains may be skipped.
	*/
	update(delta = 0, physicsAffectsIK = false) {
		this.beginFrame();
		this.mesh.updateMatrixWorld(true);
		for (const entry of this.entries) this.updateBone(entry.boneIndex, physicsAffectsIK);
		this.endFrame();
		return this;
	}
	/** Solves one definition within MMD's ordered pose evaluation. */
	updateBone(boneIndex, physicsAffectsIK = false) {
		const entry = this.entriesByBoneIndex.get(boneIndex);
		if (entry === void 0 || !entry.enabled || physicsAffectsIK && entry.canSkipForPhysics) return;
		this.solve(entry, physicsAffectsIK);
		this.mesh.updateMatrixWorld(true);
	}
	buildPhysicsBoneIndices(pmx) {
		const physicsBoneIndices = /* @__PURE__ */ new Set();
		const boneIndicesByName = /* @__PURE__ */ new Map();
		pmx.bones.forEach((bone, index) => boneIndicesByName.set(bone.name, index));
		for (const rigidBody of pmx.rigidBodies) {
			if (rigidBody.physicsMode === PmxObject.RigidBody.PhysicsMode.FollowBone) continue;
			let boneIndex = rigidBody.boneIndex;
			if (boneIndex < 0 || pmx.bones.length <= boneIndex) boneIndex = boneIndicesByName.get(rigidBody.name) ?? -1;
			if (boneIndex >= 0 && boneIndex < pmx.bones.length) physicsBoneIndices.add(boneIndex);
		}
		return physicsBoneIndices;
	}
	getEntry(ikBoneIndex) {
		const entry = this.entriesByBoneIndex.get(ikBoneIndex);
		if (entry === void 0) throw new RangeError(`MMDIKSolver: bone ${ikBoneIndex} does not contain an IK definition.`);
		return entry;
	}
	limitAngle(angle, min, max, useAxis) {
		if (angle < min) {
			const difference = 2 * min - angle;
			return difference <= max && useAxis ? difference : min;
		}
		if (angle > max) {
			const difference = 2 * max - angle;
			return difference >= min && useAxis ? difference : max;
		}
		return angle;
	}
	solve(entry, physicsAffectsIK) {
		const chains = entry.chains;
		if (chains.length === 0) return;
		for (const chain of chains) {
			chain.localRotation.copy(chain.bone.quaternion);
			chain.ikRotation.identity();
		}
		const ikPosition = this.ikPosition.setFromMatrixPosition(entry.ikBone.matrixWorld);
		const targetPosition = this.targetPosition.setFromMatrixPosition(entry.targetBone.matrixWorld);
		if (ikPosition.distanceToSquared(targetPosition) < 1e-8) return;
		const halfIteration = entry.iteration >> 1;
		for (let iteration = 0; iteration < entry.iteration; iteration += 1) {
			for (let chainIndex = 0; chainIndex < chains.length; chainIndex += 1) {
				const chain = chains[chainIndex];
				if (physicsAffectsIK && chain.physicsControlled) continue;
				if (chain.solveAxis !== "fixed") this.solveChain(entry, chain, chainIndex, ikPosition, targetPosition, iteration < halfIteration);
			}
			if (ikPosition.distanceToSquared(targetPosition) < 1e-8) break;
		}
	}
	solveChain(entry, chain, chainIndex, ikPosition, targetPosition, useAxis) {
		const chainBone = chain.bone;
		const chainPosition = this.chainPosition.setFromMatrixPosition(chainBone.matrixWorld);
		const chainTargetVector = this.chainTargetVector.subVectors(chainPosition, targetPosition).normalize();
		const chainIkVector = this.chainIkVector.subVectors(chainPosition, ikPosition).normalize();
		const chainRotationAxis = this.chainRotationAxis.crossVectors(chainTargetVector, chainIkVector);
		if (chainRotationAxis.lengthSq() < 1e-8) return;
		const parent = chainBone.parent;
		if (parent !== null) this.parentRotation.extractRotation(parent.matrixWorld);
		else this.parentRotation.identity();
		if (chain.minimumAngle !== null && useAxis) switch (chain.solveAxis) {
			case "fixed": return;
			case "none":
				this.parentRotation.decompose(this.axis, this.inverseParentRotation, this.chainPosition);
				chainRotationAxis.applyQuaternion(this.inverseParentRotation.invert()).normalize();
				break;
			case "x": {
				const dot = chainRotationAxis.dot(this.axis.setFromMatrixColumn(this.parentRotation, 0));
				chainRotationAxis.set(dot >= 0 ? 1 : -1, 0, 0);
				break;
			}
			case "y": {
				const dot = chainRotationAxis.dot(this.axis.setFromMatrixColumn(this.parentRotation, 1));
				chainRotationAxis.set(0, dot >= 0 ? 1 : -1, 0);
				break;
			}
			case "z": {
				const dot = chainRotationAxis.dot(this.axis.setFromMatrixColumn(this.parentRotation, 2));
				chainRotationAxis.set(0, 0, dot >= 0 ? 1 : -1);
				break;
			}
		}
		else {
			this.parentRotation.decompose(this.axis, this.inverseParentRotation, this.chainPosition);
			chainRotationAxis.applyQuaternion(this.inverseParentRotation.invert()).normalize();
		}
		const dot = Math.max(-1, Math.min(1, chainTargetVector.dot(chainIkVector)));
		const angle = Math.min(entry.limitAngle * (chainIndex + 1), Math.acos(dot));
		this.rotation.setFromAxisAngle(chainRotationAxis, angle);
		chain.ikRotation.premultiply(this.rotation);
		if (chain.minimumAngle !== null && chain.maximumAngle !== null) {
			this.rotation.copy(chain.ikRotation).multiply(chain.localRotation);
			const matrix = this.rotationMatrix.makeRotationFromQuaternion(this.rotation).elements;
			const threshold = 88 * Math.PI / 180;
			let rotationX;
			let rotationY;
			let rotationZ;
			switch (chain.rotationOrder) {
				case "XZY":
					rotationZ = Math.asin(-matrix[4]);
					if (Math.abs(rotationZ) > threshold) rotationZ = rotationZ < 0 ? -threshold : threshold;
					rotationX = Math.atan2(matrix[6], matrix[5]);
					rotationY = Math.atan2(matrix[8], matrix[0]);
					rotationX = this.limitAngle(rotationX, chain.minimumAngle.x, chain.maximumAngle.x, useAxis);
					rotationY = this.limitAngle(rotationY, chain.minimumAngle.y, chain.maximumAngle.y, useAxis);
					rotationZ = this.limitAngle(rotationZ, chain.minimumAngle.z, chain.maximumAngle.z, useAxis);
					chain.ikRotation.setFromAxisAngle(this.xAxis, rotationX).multiply(this.rotation2.setFromAxisAngle(this.zAxis, rotationZ)).multiply(this.rotation2.setFromAxisAngle(this.yAxis, rotationY));
					break;
				case "YXZ":
					rotationX = Math.asin(-matrix[9]);
					if (Math.abs(rotationX) > threshold) rotationX = rotationX < 0 ? -threshold : threshold;
					rotationY = Math.atan2(matrix[8], matrix[10]);
					rotationZ = Math.atan2(matrix[1], matrix[5]);
					rotationX = this.limitAngle(rotationX, chain.minimumAngle.x, chain.maximumAngle.x, useAxis);
					rotationY = this.limitAngle(rotationY, chain.minimumAngle.y, chain.maximumAngle.y, useAxis);
					rotationZ = this.limitAngle(rotationZ, chain.minimumAngle.z, chain.maximumAngle.z, useAxis);
					chain.ikRotation.setFromAxisAngle(this.yAxis, rotationY).multiply(this.rotation2.setFromAxisAngle(this.xAxis, rotationX)).multiply(this.rotation2.setFromAxisAngle(this.zAxis, rotationZ));
					break;
				case "ZYX":
					rotationY = Math.asin(-matrix[2]);
					if (Math.abs(rotationY) > threshold) rotationY = rotationY < 0 ? -threshold : threshold;
					rotationX = Math.atan2(matrix[6], matrix[10]);
					rotationZ = Math.atan2(matrix[1], matrix[0]);
					rotationX = this.limitAngle(rotationX, chain.minimumAngle.x, chain.maximumAngle.x, useAxis);
					rotationY = this.limitAngle(rotationY, chain.minimumAngle.y, chain.maximumAngle.y, useAxis);
					rotationZ = this.limitAngle(rotationZ, chain.minimumAngle.z, chain.maximumAngle.z, useAxis);
					chain.ikRotation.setFromAxisAngle(this.zAxis, rotationZ).multiply(this.rotation2.setFromAxisAngle(this.yAxis, rotationY)).multiply(this.rotation2.setFromAxisAngle(this.xAxis, rotationX));
					break;
			}
			chain.ikRotation.multiply(this.invertedLocalRotation.copy(chain.localRotation).invert());
		}
		chainBone.quaternion.copy(chain.ikRotation).multiply(chain.localRotation);
		chainBone.updateMatrixWorld(true);
		targetPosition.setFromMatrixPosition(entry.targetBone.matrixWorld);
	}
	validateBoneIndex(index, pmxBoneCount, skeletonBoneCount, description) {
		if (Number.isInteger(index) && index >= 0 && index < pmxBoneCount && index < skeletonBoneCount) return;
		throw new RangeError(`MMDIKSolver: invalid ${description} index ${index}.`);
	}
	warnAboutUnexpectedTopology(targetBone, chains) {
		let child = targetBone;
		for (const chain of chains) {
			if (child.parent === chain.bone) {
				child = chain.bone;
				continue;
			}
			console.warn(`MMDIKSolver: bone ${child.name} is not a direct child of IK link ${chain.bone.name}.`);
			child = chain.bone;
		}
	}
};
//#endregion
//#region src/utils/mmd.ts
const getActiveActions = (mixer) => {
	const internal = mixer;
	return internal._actions?.slice(0, internal._nActiveActions) ?? [];
};
const getPropertyFrameIndex = (propertyTrack, actionTime) => {
	const frameNumber = actionTime * 30;
	let low = 0;
	let high = propertyTrack.frameNumbers.length;
	while (low < high) {
		const middle = low + high >>> 1;
		if (propertyTrack.frameNumbers[middle] <= frameNumber) low = middle + 1;
		else high = middle;
	}
	return low - 1;
};
/**
* MMD model shell: holds parsed PMX, skinned mesh, IK/grants, and pluggable physics strategy.
* Lifecycle methods update scale/physics, helpers expose collider/joint visualization when available.
*/
var MMD = class {
	grantSolver;
	ikSolver;
	mesh;
	physics;
	pmx;
	scale;
	animationControlledIKBones = /* @__PURE__ */ new Map();
	animationPose;
	boneOrder;
	currentAnimationIKStates = /* @__PURE__ */ new Map();
	currentAnimationIKWeights = /* @__PURE__ */ new Map();
	ikBoneIndicesByName = /* @__PURE__ */ new Map();
	ikRotations;
	normalizedIkBoneIndicesByName = /* @__PURE__ */ new Map();
	constructor(pmx, mesh) {
		this.pmx = pmx;
		this.mesh = mesh;
		this.scale = 1;
		this.ikRotations = pmx.bones.map(() => new Quaternion());
		this.ikSolver = new MMDIKSolver(mesh, pmx, this.ikRotations);
		this.grantSolver = new GrantSolver(mesh, pmx, this.ikRotations);
		pmx.bones.forEach((bone, boneIndex) => {
			if (bone.ik === void 0) return;
			this.ikBoneIndicesByName.set(bone.name, boneIndex);
			const normalizedName = bone.name.normalize("NFKC");
			if (!this.normalizedIkBoneIndicesByName.has(normalizedName)) this.normalizedIkBoneIndicesByName.set(normalizedName, boneIndex);
		});
		this.boneOrder = pmx.bones.map((_, index) => index).sort((a, b) => pmx.bones[a].transformOrder - pmx.bones[b].transformOrder || a - b);
	}
	/** Evaluates post-physics bones after the physics service writes back its pose. */
	afterPhysics(options = {}) {
		this.updateBones(true, options);
		this.grantSolver.endFrame();
		this.ikSolver.endFrame();
	}
	/** Restores unchanged solver output, captures the input, and evaluates pre-physics bones. */
	beforePhysics(options = {}) {
		this.grantSolver.beginFrame();
		this.ikSolver.beginFrame();
		const bones = this.mesh.skeleton.bones;
		this.animationPose ??= bones.map((bone) => ({
			position: bone.position.clone(),
			rotation: bone.quaternion.clone()
		}));
		this.animationPose.forEach((pose, index) => {
			pose.position.copy(bones[index].position);
			pose.rotation.copy(bones[index].quaternion);
		});
		this.updateBones(false, options);
	}
	/**
	* Restores the skeletal pose sampled by the previous animation frame.
	*
	* Call this immediately before the animation mixer updates the mesh.
	*/
	beforeUpdate() {
		this.animationPose?.forEach((pose, index) => {
			const bone = this.mesh.skeleton.bones[index];
			bone.position.copy(pose.position);
			bone.quaternion.copy(pose.rotation);
		});
		this.grantSolver.reset();
		this.ikSolver.reset();
	}
	dispose() {
		this.physics?.dispose?.();
		this.physics = void 0;
		this.animationPose = void 0;
	}
	setPhysics(createPhysics) {
		if (this.physics) throw new Error("MMD: Physics has already been installed.");
		const physics = createPhysics(this);
		this.physics = physics;
		physics.setScalar?.(this.scale);
	}
	setScalar(scale) {
		if (this.scale === scale) return;
		this.scale = scale;
		this.mesh.scale.setScalar(scale);
		this.mesh.updateMatrixWorld(true);
		this.physics?.setScalar?.(scale);
	}
	/**
	* Applies MMD-specific pose processing after an animation mixer updates the mesh.
	*
	* The ordering is significant: the mixer pose is cached before IK and append
	* transforms mutate the bones, so the next frame can start from an unmodified
	* animation pose. Call beforeUpdate() before advancing an external mixer.
	*/
	update(delta, options = {}) {
		this.beforePhysics(options);
		if (options.physics !== false) this.physics?.update(delta);
		this.afterPhysics(options);
	}
	updateAnimation(mixer) {
		this.currentAnimationIKStates.clear();
		this.currentAnimationIKWeights.clear();
		if (mixer != null) {
			const animationActions = getActiveActions(mixer);
			for (const action of animationActions) {
				const propertyTrack = action.getClip().userData.propertyTrack;
				if (propertyTrack == null) continue;
				const weight = action.getEffectiveWeight();
				if (weight <= 0 || propertyTrack.frameNumbers.length === 0) continue;
				const frameIndex = getPropertyFrameIndex(propertyTrack, action.time);
				if (frameIndex < 0) continue;
				for (let i = 0; i < propertyTrack.ikBoneNames.length; i++) {
					const ikBoneName = propertyTrack.ikBoneNames[i];
					const boneIndex = this.ikBoneIndicesByName.get(ikBoneName) ?? this.normalizedIkBoneIndicesByName.get(ikBoneName.normalize("NFKC"));
					if (boneIndex === void 0) continue;
					const enabled = propertyTrack.ikStates[i]?.[frameIndex];
					if (enabled == null) continue;
					const currentWeight = this.currentAnimationIKWeights.get(boneIndex);
					if (currentWeight !== void 0 && currentWeight >= weight) continue;
					this.currentAnimationIKWeights.set(boneIndex, weight);
					this.currentAnimationIKStates.set(boneIndex, enabled);
				}
			}
		}
		for (const [boneIndex, enabled] of this.currentAnimationIKStates) {
			if (!this.animationControlledIKBones.has(boneIndex)) this.animationControlledIKBones.set(boneIndex, this.ikSolver.isEnabled(boneIndex));
			if (this.ikSolver.isEnabled(boneIndex) !== enabled) this.ikSolver.setEnabled(boneIndex, enabled);
		}
		for (const [boneIndex, enabled] of this.animationControlledIKBones) {
			if (this.currentAnimationIKStates.has(boneIndex)) continue;
			if (this.ikSolver.isEnabled(boneIndex) !== enabled) this.ikSolver.setEnabled(boneIndex, enabled);
			this.animationControlledIKBones.delete(boneIndex);
		}
	}
	updateWithMixer(delta, mixer, options = {}) {
		this.beforeUpdate();
		mixer.update(delta);
		this.updateAnimation(mixer);
		this.update(delta, options);
	}
	updateBones(afterPhysics, options) {
		this.mesh.updateMatrixWorld(true);
		const physicsAffectsIK = options.physics !== false && this.physics?.affectsIK === true;
		for (const boneIndex of this.boneOrder) {
			if ((this.pmx.bones[boneIndex].flag & PmxObject.Bone.Flag.TransformAfterPhysics) !== 0 !== afterPhysics) continue;
			if (options.grant !== false) this.grantSolver.updateBone(boneIndex);
			if (options.ik !== false) this.ikSolver.updateBone(boneIndex, physicsAffectsIK);
		}
		this.mesh.updateMatrixWorld(true);
	}
};
//#endregion
//#region src/utils/post-parse.ts
/**
* Post-PMX parse normalization: flip Z to right-handed coords once so downstream builders
* (geometry/bones/morphs/rigid bodies) don't need scattered Z flips.
*/
const postParseProcessing = (pmx) => {
	pmx.vertices.forEach((v) => {
		v.position[2] = -v.position[2];
		v.normal[2] = -v.normal[2];
		if (v.weightType !== PmxObject.Vertex.BoneWeightType.Sdef) return;
		const sdef = v.boneWeight.boneWeights;
		sdef.c[2] = -sdef.c[2];
		sdef.r0[2] = -sdef.r0[2];
		sdef.r1[2] = -sdef.r1[2];
	});
	for (let i = 0; i < pmx.indices.length; i += 3) {
		const tmp = pmx.indices[i + 1];
		pmx.indices[i + 1] = pmx.indices[i + 2];
		pmx.indices[i + 2] = tmp;
	}
	pmx.bones.forEach((bone) => {
		bone.position[2] = -bone.position[2];
		for (const link of bone.ik?.links ?? []) {
			const limitation = link.limitation;
			if (limitation === void 0) continue;
			const minimum = limitation.minimumAngle;
			const maximum = limitation.maximumAngle;
			const minimumX = minimum[0];
			const minimumY = minimum[1];
			const maximumX = maximum[0];
			const maximumY = maximum[1];
			minimum[0] = -maximumX;
			minimum[1] = -maximumY;
			maximum[0] = -minimumX;
			maximum[1] = -minimumY;
		}
	});
	pmx.morphs.forEach((morph) => {
		if (morph.type !== PmxObject.Morph.Type.VertexMorph) return;
		for (let i = 0; i < morph.positions.length; i += 3) morph.positions[i + 2] = -morph.positions[i + 2];
	});
	pmx.rigidBodies?.forEach((body) => {
		body.shapePosition[2] = -body.shapePosition[2];
		body.shapeRotation[0] = -body.shapeRotation[0];
		body.shapeRotation[1] = -body.shapeRotation[1];
	});
	pmx.joints?.forEach((joint) => {
		joint.position[2] = -joint.position[2];
		joint.rotation[0] = -joint.rotation[0];
		joint.rotation[1] = -joint.rotation[1];
	});
	return pmx;
};
//#endregion
//#region src/loaders/mmd-loader.ts
var MMDLoader = class extends Loader {
	pluginCallbacks = [];
	constructor(manager) {
		super(manager);
	}
	load(url, onLoad, onProgress, onError) {
		let resourcePath;
		if (this.resourcePath !== "") resourcePath = this.resourcePath;
		else if (this.path !== "") resourcePath = LoaderUtils.resolveURL(LoaderUtils.extractUrlBase(url), this.path);
		else resourcePath = LoaderUtils.extractUrlBase(url);
		const loader = new FileLoader(this.manager);
		loader.setResponseType("arraybuffer");
		loader.setPath(this.path);
		loader.setRequestHeader(this.requestHeader);
		loader.setWithCredentials(this.withCredentials);
		loader.load(url, (buffer) => {
			try {
				const modelExtension = extractModelExtension(buffer);
				if (!["pmd", "pmx"].includes(modelExtension)) {
					onError?.(/* @__PURE__ */ new Error(`MMDLoader: Unknown model file extension .${modelExtension}.`));
					return;
				}
				const parser = {
					manager: this.manager,
					resourcePath
				};
				const pluginsByName = /* @__PURE__ */ new Map();
				for (const callback of this.pluginCallbacks) {
					const plugin = callback(parser);
					if (!plugin.name) console.error("MMDLoader: Invalid plugin found: missing name");
					pluginsByName.set(plugin.name, plugin);
				}
				const plugins = [...pluginsByName.values()];
				const materialPlugins = plugins.filter((plugin) => plugin.materialType !== void 0);
				if (materialPlugins.length > 1) {
					onError?.(/* @__PURE__ */ new Error("MMDLoader: only one MMDMaterialPlugin may be registered."));
					return;
				}
				const materialType = materialPlugins[0]?.materialType;
				(modelExtension === "pmd" ? PmdReader : PmxReader).ParseAsync(buffer).then(async (pmx) => {
					pmx = postParseProcessing(pmx);
					for (const plugin of plugins) {
						if (!plugin.afterParse) continue;
						const result = await plugin.afterParse(pmx);
						if (result !== void 0) pmx = result;
					}
					const mmd = this.assembleMMD(pmx, resourcePath, materialType);
					for (const plugin of plugins) await plugin.afterBuild?.(mmd);
					onLoad(mmd);
				}).catch(onError);
			} catch (e) {
				onError?.(e);
			}
		}, onProgress, onError);
	}
	async loadAsync(url, onProgress) {
		return super.loadAsync(url, onProgress);
	}
	register(callback) {
		if (!this.pluginCallbacks.includes(callback)) this.pluginCallbacks.push(callback);
		return this;
	}
	unregister(callback) {
		const index = this.pluginCallbacks.indexOf(callback);
		if (index !== -1) this.pluginCallbacks.splice(index, 1);
		return this;
	}
	assembleMMD(pmx, resourcePath, materialType) {
		const geometry = buildGeometry(pmx);
		const skinnedMesh = buildBones(pmx, new SkinnedMesh(geometry, buildMaterial(pmx, geometry, resourcePath, this.manager, materialType)));
		installMMDMaterialBindings(skinnedMesh);
		return new MMD(pmx, skinnedMesh);
	}
};
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/Parser/vmdObject.js
/**
* VMD data
*
* The creation of this object means that the validation and indexing of the Vmd data are finished
*
* Therefore, there is no parsing error when reading data from VmdData
*/
var VmdData = class VmdData {
	static _Signature = "Vocaloid Motion Data 0002";
	/**
	* Signature bytes
	*
	* The first 30 bytes of the VMD file must be "Vocaloid Motion Data 0002"
	* @internal
	*/
	static SignatureBytes = 30;
	/**
	* Model name bytes
	*
	* The next 20 bytes of the VMD file must be the model name
	*
	* MMD assuming that motion is usually valid for one model
	*
	* so when binding target model name is different from the model name in VMD file, MMD warns the user
	* @internal
	*/
	static ModelNameBytes = 20;
	/**
	* Bone key frame bytes
	* @internal
	*/
	static BoneKeyFrameBytes = 111;
	/**
	* Morph key frame bytes
	* @internal
	*/
	static MorphKeyFrameBytes = 23;
	/**
	* Camera key frame bytes
	* @internal
	*/
	static CameraKeyFrameBytes = 61;
	/**
	* Light key frame bytes
	* @internal
	*/
	static LightKeyFrameBytes = 28;
	/**
	* Self shadow key frame bytes
	* @internal
	*/
	static SelfShadowKeyFrameBytes = 9;
	/**
	* Property key frame bytes
	* @internal
	*/
	static PropertyKeyFrameBytes = 5;
	/**
	* Property key frame IK state bytes
	* @internal
	*/
	static PropertyKeyFrameIkStateBytes = 21;
	/**
	* Data deserializer for reading VMD data
	* @internal
	*/
	dataDeserializer;
	/**
	* Bone key frame count
	*/
	boneKeyFrameCount;
	/**
	* Morph key frame count
	*/
	morphKeyFrameCount;
	/**
	* Camera key frame count
	*/
	cameraKeyFrameCount;
	/**
	* Light key frame count
	*/
	lightKeyFrameCount;
	/**
	* Self shadow key frame count
	*/
	selfShadowKeyFrameCount;
	/**
	* Property key frame count
	*/
	propertyKeyFrameCount;
	constructor(dataDeserializer, boneKeyFrameCount, morphKeyFrameCount, cameraKeyFrameCount, lightKeyFrameCount, selfShadowKeyFrameCount, propertyKeyFrameCount) {
		this.dataDeserializer = dataDeserializer;
		this.boneKeyFrameCount = boneKeyFrameCount;
		this.morphKeyFrameCount = morphKeyFrameCount;
		this.cameraKeyFrameCount = cameraKeyFrameCount;
		this.lightKeyFrameCount = lightKeyFrameCount;
		this.selfShadowKeyFrameCount = selfShadowKeyFrameCount;
		this.propertyKeyFrameCount = propertyKeyFrameCount;
	}
	/**
	* Create a new `VmdData` instance from the given buffer
	* @param buffer ArrayBuffer
	* @param logger Logger
	* @returns `VmdData` instance if the given buffer is a valid VMD data, otherwise `null`
	*/
	static CheckedCreate(buffer, logger = new ConsoleLogger()) {
		const dataDeserializer = new MmdDataDeserializer(buffer);
		dataDeserializer.initializeTextDecoder("shift-jis");
		if (dataDeserializer.bytesAvailable < VmdData.SignatureBytes + VmdData.ModelNameBytes) return null;
		if (dataDeserializer.getSignatureString(this.SignatureBytes).substring(0, this._Signature.length) !== this._Signature) return null;
		dataDeserializer.offset += VmdData.ModelNameBytes;
		let boneKeyFrameCount = 0;
		let morphKeyFrameCount = 0;
		let cameraKeyFrameCount = 0;
		let lightKeyFrameCount = 0;
		let selfShadowKeyFrameCount = 0;
		let propertyKeyFrameCount = 0;
		if (dataDeserializer.bytesAvailable < 4) return null;
		boneKeyFrameCount = dataDeserializer.getUint32();
		if (dataDeserializer.bytesAvailable < boneKeyFrameCount * VmdData.BoneKeyFrameBytes) return null;
		dataDeserializer.offset += boneKeyFrameCount * VmdData.BoneKeyFrameBytes;
		if (dataDeserializer.bytesAvailable < 4) return null;
		morphKeyFrameCount = dataDeserializer.getUint32();
		if (dataDeserializer.bytesAvailable < morphKeyFrameCount * VmdData.MorphKeyFrameBytes) return null;
		dataDeserializer.offset += morphKeyFrameCount * VmdData.MorphKeyFrameBytes;
		if (dataDeserializer.bytesAvailable !== 0) {
			if (dataDeserializer.bytesAvailable < 4) return null;
			cameraKeyFrameCount = dataDeserializer.getUint32();
			if (dataDeserializer.bytesAvailable < cameraKeyFrameCount * VmdData.CameraKeyFrameBytes) return null;
			dataDeserializer.offset += cameraKeyFrameCount * VmdData.CameraKeyFrameBytes;
			if (dataDeserializer.bytesAvailable < 4) return null;
			lightKeyFrameCount = dataDeserializer.getUint32();
			if (dataDeserializer.bytesAvailable < lightKeyFrameCount * VmdData.LightKeyFrameBytes) return null;
			dataDeserializer.offset += lightKeyFrameCount * VmdData.LightKeyFrameBytes;
		}
		if (dataDeserializer.bytesAvailable !== 0) {
			if (dataDeserializer.bytesAvailable < 4) return null;
			selfShadowKeyFrameCount = dataDeserializer.getUint32();
			if (dataDeserializer.bytesAvailable < selfShadowKeyFrameCount * VmdData.SelfShadowKeyFrameBytes) return null;
			dataDeserializer.offset += selfShadowKeyFrameCount * VmdData.SelfShadowKeyFrameBytes;
		}
		if (dataDeserializer.bytesAvailable !== 0) {
			if (dataDeserializer.bytesAvailable < 4) return null;
			propertyKeyFrameCount = dataDeserializer.getUint32();
			for (let i = 0; i < propertyKeyFrameCount; ++i) {
				if (dataDeserializer.bytesAvailable < VmdData.PropertyKeyFrameBytes) return null;
				dataDeserializer.offset += VmdData.PropertyKeyFrameBytes;
				if (dataDeserializer.bytesAvailable < 4) return null;
				const propertyKeyFrameIkStateCount = dataDeserializer.getUint32();
				if (dataDeserializer.bytesAvailable < propertyKeyFrameIkStateCount * VmdData.PropertyKeyFrameIkStateBytes) return null;
				dataDeserializer.offset += propertyKeyFrameIkStateCount * VmdData.PropertyKeyFrameIkStateBytes;
			}
		}
		if (dataDeserializer.bytesAvailable > 0) logger.warn(`There are ${dataDeserializer.bytesAvailable} bytes left after parsing`);
		dataDeserializer.offset = 0;
		return new VmdData(dataDeserializer, boneKeyFrameCount, morphKeyFrameCount, cameraKeyFrameCount, lightKeyFrameCount, selfShadowKeyFrameCount, propertyKeyFrameCount);
	}
};
/**
* VMD object
*
* Lazy parsed VMD data object
*
* The total amount of memory used is more than parsing at once
*
* but you can adjust the instantaneous memory usage to a smaller extent
*/
var VmdObject = class VmdObject {
	/**
	* Property key frames
	*
	* Property key frames are only preparsed because they size is not fixed
	*/
	propertyKeyFrames;
	_vmdData;
	constructor(vmdData, propertyKeyFrames) {
		this._vmdData = vmdData;
		this.propertyKeyFrames = propertyKeyFrames;
	}
	/**
	* Parse VMD data
	* @param vmdData VMD data
	* @returns `VmdObject` instance
	*/
	static Parse(vmdData) {
		const dataDeserializer = vmdData.dataDeserializer;
		const propertyKeyFrames = [];
		dataDeserializer.offset = VmdData.SignatureBytes + VmdData.ModelNameBytes + 4 + vmdData.boneKeyFrameCount * VmdData.BoneKeyFrameBytes + 4 + vmdData.morphKeyFrameCount * VmdData.MorphKeyFrameBytes + 4 + vmdData.cameraKeyFrameCount * VmdData.CameraKeyFrameBytes + 4 + vmdData.lightKeyFrameCount * VmdData.LightKeyFrameBytes + 4 + vmdData.selfShadowKeyFrameCount * VmdData.SelfShadowKeyFrameBytes + 4;
		const propertyKeyFrameCount = vmdData.propertyKeyFrameCount;
		for (let i = 0; i < propertyKeyFrameCount; ++i) {
			const frameNumber = dataDeserializer.getUint32();
			const visible = dataDeserializer.getUint8() !== 0;
			const ikStateCount = dataDeserializer.getUint32();
			const ikStates = [];
			for (let j = 0; j < ikStateCount; ++j) {
				const ikName = dataDeserializer.getDecoderString(20, true);
				const ikEnabled = dataDeserializer.getUint8() !== 0;
				ikStates.push([ikName, ikEnabled]);
			}
			const propertyKeyFrame = {
				frameNumber,
				visible,
				ikStates
			};
			propertyKeyFrames.push(propertyKeyFrame);
		}
		return new VmdObject(vmdData, propertyKeyFrames);
	}
	/**
	* Parse VMD data from the given buffer
	* @param buffer ArrayBuffer
	* @returns `VmdObject` instance
	* @throws {Error} if the given buffer is not a valid VMD data
	*/
	static ParseFromBuffer(buffer) {
		const vmdData = VmdData.CheckedCreate(buffer);
		if (vmdData === null) throw new Error("Invalid VMD data");
		return VmdObject.Parse(vmdData);
	}
	/**
	* Get bone key frame reader
	*/
	get boneKeyFrames() {
		const offset = VmdData.SignatureBytes + VmdData.ModelNameBytes + 4;
		return new VmdObject.BoneKeyFrames(this._vmdData.dataDeserializer, offset, this._vmdData.boneKeyFrameCount);
	}
	/**
	* Get morph key frame reader
	*/
	get morphKeyFrames() {
		const offset = VmdData.SignatureBytes + VmdData.ModelNameBytes + 4 + this._vmdData.boneKeyFrameCount * VmdData.BoneKeyFrameBytes + 4;
		return new VmdObject.MorphKeyFrames(this._vmdData.dataDeserializer, offset, this._vmdData.morphKeyFrameCount);
	}
	/**
	* Get camera key frame reader
	*/
	get cameraKeyFrames() {
		const offset = VmdData.SignatureBytes + VmdData.ModelNameBytes + 4 + this._vmdData.boneKeyFrameCount * VmdData.BoneKeyFrameBytes + 4 + this._vmdData.morphKeyFrameCount * VmdData.MorphKeyFrameBytes + 4;
		return new VmdObject.CameraKeyFrames(this._vmdData.dataDeserializer, offset, this._vmdData.cameraKeyFrameCount);
	}
	/**
	* Get light key frame reader
	*/
	get lightKeyFrames() {
		const offset = VmdData.SignatureBytes + VmdData.ModelNameBytes + 4 + this._vmdData.boneKeyFrameCount * VmdData.BoneKeyFrameBytes + 4 + this._vmdData.morphKeyFrameCount * VmdData.MorphKeyFrameBytes + 4 + this._vmdData.cameraKeyFrameCount * VmdData.CameraKeyFrameBytes + 4;
		return new VmdObject.LightKeyFrames(this._vmdData.dataDeserializer, offset, this._vmdData.lightKeyFrameCount);
	}
	/**
	* Get self shadow key frame reader
	*/
	get selfShadowKeyFrames() {
		const offset = VmdData.SignatureBytes + VmdData.ModelNameBytes + 4 + this._vmdData.boneKeyFrameCount * VmdData.BoneKeyFrameBytes + 4 + this._vmdData.morphKeyFrameCount * VmdData.MorphKeyFrameBytes + 4 + this._vmdData.cameraKeyFrameCount * VmdData.CameraKeyFrameBytes + 4 + this._vmdData.lightKeyFrameCount * VmdData.LightKeyFrameBytes + 4;
		return new VmdObject.SelfShadowKeyFrames(this._vmdData.dataDeserializer, offset, this._vmdData.selfShadowKeyFrameCount);
	}
};
(function(VmdObject) {
	/**
	* key frame reader base class
	*/
	class BufferArrayReader {
		_dataDeserializer;
		_startOffset;
		_length;
		/**
		* Create a new `BufferArrayReader` instance
		* @param dataDeserializer Data deserializer
		* @param startOffset Data start offset
		* @param length Data length
		*/
		constructor(dataDeserializer, startOffset, length) {
			this._dataDeserializer = dataDeserializer;
			this._startOffset = startOffset;
			this._length = length;
		}
		/**
		* Length of the data
		*/
		get length() {
			return this._length;
		}
	}
	VmdObject.BufferArrayReader = BufferArrayReader;
	/**
	* Bone key frame reader
	*/
	class BoneKeyFrames extends BufferArrayReader {
		/**
		* Create a new `BoneKeyFrames` instance
		* @param dataDeserializer Data deserializer
		* @param startOffset Data start offset
		* @param length Data length
		*/
		constructor(dataDeserializer, startOffset, length) {
			super(dataDeserializer, startOffset, length);
		}
		/**
		* Get the data at the given index
		* @param index Index
		* @returns `BoneKeyFrame` instance
		*/
		get(index) {
			const offset = this._startOffset + index * VmdData.BoneKeyFrameBytes;
			return new BoneKeyFrame(this._dataDeserializer, offset);
		}
	}
	VmdObject.BoneKeyFrames = BoneKeyFrames;
	/**
	* Bone key frame
	*/
	class BoneKeyFrame {
		/**
		* Bone name
		*/
		boneName;
		/**
		* Frame number
		*/
		frameNumber;
		/**
		* Position
		*/
		position;
		/**
		* Rotation quaternion
		*/
		rotation;
		/**
		* Interpolation
		*
		* https://hariganep.seesaa.net/article/201103article_1.html
		* https://x.com/KuroNekoMeguMMD/status/1864306974856499520/
		*
		* The interpolation parameters are four Bezier curves (0,0), (x1,y1), (x2,y2), and (127,127)
		*
		* It represents the parameters of each axis
		*
		* - X-axis interpolation parameters (X_x1, X_y1), (X_x2, X_y2)
		* - Y-axis interpolation parameters (Y_x1, Y_y1), (Y_x2, Y_y2)
		* - Z-axis interpolation parameters (Z_x1, Z_y1), (Z_x2, Z_y2)
		* - Rotation interpolation parameters (R_x1, R_y1), (R_x2, R_y2)
		*
		* And interpolation parameters also include physics toggle parameters
		* - Physics toggle parameters (phy1, phy2)
		*
		* Physics toggle parameters has two varients
		* - phy1: 0x00, phy2: 0x00 (physics off)
		* - phy1: 0x63, phy2: 0x0f (physics on)
		*
		* Then, the interpolation parameters are as follows
		*
		* X_x1,Y_x1,phy1,phy2,
		* X_y1,Y_y1,Z_y1,R_y1,
		* X_x2,Y_x2,Z_x2,R_x2,
		* X_y2,Y_y2,Z_y2,R_y2,
		*
		* Y_x1,Z_x1,R_x1,X_y1,
		* Y_y1,Z_y1,R_y1,X_x2,
		* Y_x2,Z_x2,R_x2,X_y2,
		* Y_y2,Z_y2,R_y2, 00,
		*
		* Z_x1,R_x1,X_y1,Y_y1,
		* Z_y1,R_y1,X_x2,Y_x2,
		* Z_x2,R_x2,X_y2,Y_y2,
		* Z_y2,R_y2, 00, 00,
		*
		* R_x1,X_y1,Y_y1,Z_y1,
		* R_y1,X_x2,Y_x2,Z_x2,
		* R_x2,X_y2,Y_y2,Z_y2,
		* R_y2, 00, 00, 00
		*
		* [4][4][4] = [64]
		*/
		interpolation;
		/**
		* Create a new `BoneKeyFrame` instance
		* @param dataDeserializer Data deserializer
		* @param offset Data offset
		*/
		constructor(dataDeserializer, offset) {
			dataDeserializer.offset = offset;
			this.boneName = dataDeserializer.getDecoderString(15, true);
			this.frameNumber = dataDeserializer.getUint32();
			this.position = dataDeserializer.getFloat32Tuple(3);
			this.rotation = dataDeserializer.getFloat32Tuple(4);
			this.interpolation = /* @__PURE__ */ new Uint8Array(64);
			for (let i = 0; i < 64; ++i) this.interpolation[i] = dataDeserializer.getUint8();
		}
	}
	VmdObject.BoneKeyFrame = BoneKeyFrame;
	(function(BoneKeyFramePhysicsInfoKind) {
		/**
		* Physics off
		*
		* Rigid body position is driven by animation
		*/
		BoneKeyFramePhysicsInfoKind[BoneKeyFramePhysicsInfoKind["Off"] = 25359] = "Off";
		/**
		* Physics on
		*
		* Rigid body position is driven by physics, only affected when the bone has a rigid body
		*/
		BoneKeyFramePhysicsInfoKind[BoneKeyFramePhysicsInfoKind["On"] = 0] = "On";
	})(VmdObject.BoneKeyFramePhysicsInfoKind || (VmdObject.BoneKeyFramePhysicsInfoKind = {}));
	/**
	* Morph key frame reader
	*/
	class MorphKeyFrames extends BufferArrayReader {
		/**
		* Create a new `MorphKeyFrames` instance
		* @param dataDeserializer Data deserializer
		* @param startOffset Data start offset
		* @param length Data length
		*/
		constructor(dataDeserializer, startOffset, length) {
			super(dataDeserializer, startOffset, length);
		}
		/**
		* Get the data at the given index
		* @param index Index
		* @returns `MorphKeyFrame` instance
		*/
		get(index) {
			const offset = this._startOffset + index * VmdData.MorphKeyFrameBytes;
			return new MorphKeyFrame(this._dataDeserializer, offset);
		}
	}
	VmdObject.MorphKeyFrames = MorphKeyFrames;
	/**
	* Morph key frame
	*/
	class MorphKeyFrame {
		/**
		* Morph name
		*/
		morphName;
		/**
		* Frame number
		*/
		frameNumber;
		/**
		* Weight
		*/
		weight;
		/**
		* Create a new `MorphKeyFrame` instance
		* @param dataDeserializer Data deserializer
		* @param offset Data offset
		*/
		constructor(dataDeserializer, offset) {
			dataDeserializer.offset = offset;
			this.morphName = dataDeserializer.getDecoderString(15, true);
			this.frameNumber = dataDeserializer.getUint32();
			this.weight = dataDeserializer.getFloat32();
		}
	}
	VmdObject.MorphKeyFrame = MorphKeyFrame;
	/**
	* Camera key frame reader
	*/
	class CameraKeyFrames extends BufferArrayReader {
		/**
		* Create a new `CameraKeyFrames` instance
		* @param dataDeserializer Data deserializer
		* @param startOffset Data start offset
		* @param length Data length
		*/
		constructor(dataDeserializer, startOffset, length) {
			super(dataDeserializer, startOffset, length);
		}
		/**
		* Get the data at the given index
		* @param index Index
		* @returns `CameraKeyFrame` instance
		*/
		get(index) {
			const offset = this._startOffset + index * VmdData.CameraKeyFrameBytes;
			return new CameraKeyFrame(this._dataDeserializer, offset);
		}
	}
	VmdObject.CameraKeyFrames = CameraKeyFrames;
	/**
	* Camera key frame
	*/
	class CameraKeyFrame {
		/**
		* Frame number
		*/
		frameNumber;
		/**
		* Distance from the camera center
		*/
		distance;
		/**
		* Camera center position
		*/
		position;
		/**
		* Camera rotation in yaw, pitch, roll order
		*/
		rotation;
		/**
		* Interpolation
		*
		* range: 0..=127
		*
		* default linear interpolation is 20, 107, 20, 107
		*
		* Repr:
		*
		* x_ax, x_bx, x_ay, x_by,
		* y_ax, y_bx, y_ay, y_by,
		* z_ax, z_bx, z_ay, z_by,
		* rot_ax, rot_bx, rot_ay, rot_by,
		* distance_ax, distance_bx, distance_ay, distance_by,
		* angle_ax, angle_bx, angle_ay, angle_by
		*/
		interpolation;
		/**
		* Angle of view (in degrees)
		*/
		fov;
		/**
		* Whether the camera is perspective or orthographic
		*/
		perspective;
		/**
		* Create a new `CameraKeyFrame` instance
		* @param dataDeserializer Data deserializer
		* @param offset Data offset
		*/
		constructor(dataDeserializer, offset) {
			dataDeserializer.offset = offset;
			this.frameNumber = dataDeserializer.getUint32();
			this.distance = dataDeserializer.getFloat32();
			this.position = dataDeserializer.getFloat32Tuple(3);
			this.rotation = dataDeserializer.getFloat32Tuple(3);
			this.interpolation = /* @__PURE__ */ new Uint8Array(24);
			for (let i = 0; i < 24; ++i) this.interpolation[i] = dataDeserializer.getUint8();
			this.fov = dataDeserializer.getUint32();
			this.perspective = dataDeserializer.getUint8() !== 0;
		}
	}
	VmdObject.CameraKeyFrame = CameraKeyFrame;
	/**
	* Light key frame reader
	*/
	class LightKeyFrames extends BufferArrayReader {
		/**
		* Create a new `LightKeyFrames` instance
		* @param dataDeserializer Data deserializer
		* @param startOffset Data start offset
		* @param length Data length
		*/
		constructor(dataDeserializer, startOffset, length) {
			super(dataDeserializer, startOffset, length);
		}
		/**
		* Get the data at the given index
		* @param index Index
		* @returns `LightKeyFrame` instance
		*/
		get(index) {
			const offset = this._startOffset + index * VmdData.LightKeyFrameBytes;
			return new LightKeyFrame(this._dataDeserializer, offset);
		}
	}
	VmdObject.LightKeyFrames = LightKeyFrames;
	/**
	* Light key frame
	*/
	class LightKeyFrame {
		/**
		* Frame number
		*/
		frameNumber;
		/**
		* Light color
		*/
		color;
		/**
		* Light direction
		*/
		direction;
		/**
		* Create a new `LightKeyFrame` instance
		* @param dataDeserializer Data deserializer
		* @param offset Data offset
		*/
		constructor(dataDeserializer, offset) {
			dataDeserializer.offset = offset;
			this.frameNumber = dataDeserializer.getUint32();
			this.color = dataDeserializer.getFloat32Tuple(3);
			this.direction = dataDeserializer.getFloat32Tuple(3);
		}
	}
	VmdObject.LightKeyFrame = LightKeyFrame;
	/**
	* Self shadow key frame reader
	*/
	class SelfShadowKeyFrames extends BufferArrayReader {
		/**
		* Create a new `SelfShadowKeyFrames` instance
		* @param dataDeserializer Data deserializer
		* @param startOffset Data start offset
		* @param length Data length
		*/
		constructor(dataDeserializer, startOffset, length) {
			super(dataDeserializer, startOffset, length);
		}
		/**
		* Get the data at the given index
		* @param index Index
		* @returns `SelfShadowKeyFrame` instance
		*/
		get(index) {
			const offset = this._startOffset + index * VmdData.SelfShadowKeyFrameBytes;
			return new SelfShadowKeyFrame(this._dataDeserializer, offset);
		}
	}
	VmdObject.SelfShadowKeyFrames = SelfShadowKeyFrames;
	/**
	* Self shadow key frame
	*/
	class SelfShadowKeyFrame {
		/**
		* Frame number
		*/
		frameNumber;
		/**
		* Shadow mode
		*/
		mode;
		/**
		* Distance
		*/
		distance;
		/**
		* Create a new `SelfShadowKeyFrame` instance
		* @param dataDeserializer Data deserializer
		* @param offset Data offset
		*/
		constructor(dataDeserializer, offset) {
			dataDeserializer.offset = offset;
			this.frameNumber = dataDeserializer.getUint32();
			this.mode = dataDeserializer.getUint8();
			this.distance = dataDeserializer.getFloat32();
		}
	}
	VmdObject.SelfShadowKeyFrame = SelfShadowKeyFrame;
})(VmdObject || (VmdObject = {}));
//#endregion
//#region src/loaders/vmd-loader.ts
var VMDLoader = class extends Loader {
	constructor(manager) {
		super(manager);
	}
	load(url, onLoad, onProgress, onError) {
		const loader = new FileLoader(this.manager);
		loader.setResponseType("arraybuffer");
		loader.setPath(this.path);
		loader.setRequestHeader(this.requestHeader);
		loader.setWithCredentials(this.withCredentials);
		loader.load(url, (buffer) => onLoad(VmdObject.ParseFromBuffer(buffer)), onProgress, onError);
	}
	async loadAsync(url, onProgress) {
		return super.loadAsync(url, onProgress);
	}
};
//#endregion
//#region ../../node_modules/.pnpm/babylon-mmd@1.3.0_@babylonjs+core@9.18.0/node_modules/babylon-mmd/esm/Loader/Parser/vpdReader.js
/**
* VpdReader is a static class that parses VPD data
*/
var VpdReader = class VpdReader {
	static _Signature = "Vocaloid Pose Data file";
	constructor() {}
	/**
	* Parse VPD data
	* @param data VPD data
	* @param logger logger
	* @returns MMD animation data
	* @throws {Error} If validation fails
	*/
	static Parse(data, logger = new ConsoleLogger()) {
		if (!data.startsWith(VpdReader._Signature)) throw new Error("VPD signature is not valid.");
		const state = [VpdReader._Signature.length];
		VpdReader._ConsumeStatement(data, state);
		VpdReader._ConsumeStatement(data, state);
		const bones = {};
		const morphs = {};
		while (state[0] < data.length) {
			state[0] = VpdReader._ConsumeEmpty(data, state[0]);
			if (data.length <= state[0]) break;
			const typeAndIndex = VpdReader._ConsumeBeforeOpenBracket(data, state);
			if (typeAndIndex.startsWith("Bone")) {
				const id = VpdReader._ConsumeBeforeLineEnding(data, state);
				let position = void 0;
				let rotation = void 0;
				const positionStmt = VpdReader._ConsumeStatement(data, state);
				const positionComponents = positionStmt.split(",");
				if (positionComponents.length !== 3) logger.warn(`Position components are not 3: ${positionStmt}`);
				else {
					const x = Number(positionComponents[0]);
					const y = Number(positionComponents[1]);
					const z = Number(positionComponents[2]);
					if (isNaN(x) || isNaN(y) || isNaN(x)) logger.warn(`Invalid position: ${positionStmt}`);
					else if (x !== 0 || y !== 0 || z !== 0) position = [
						x,
						y,
						z
					];
				}
				const rotationStmt = VpdReader._ConsumeStatement(data, state);
				const rotationComponents = rotationStmt.split(",");
				if (rotationComponents.length !== 4) logger.warn(`Rotation components are not 4: ${rotationStmt}`);
				else {
					const x = Number(rotationComponents[0]);
					const y = Number(rotationComponents[1]);
					const z = Number(rotationComponents[2]);
					const w = Number(rotationComponents[3]);
					if (isNaN(x) || isNaN(y) || isNaN(x) || isNaN(w)) logger.warn(`Invalid rotation: ${rotationStmt}`);
					else rotation = [
						x,
						y,
						z,
						w
					];
				}
				if (rotation !== void 0) {
					if (bones[id] !== void 0) logger.warn(`Duplicate bone: ${id}. Use the last one.`);
					bones[id] = {
						position,
						rotation
					};
				}
			} else if (typeAndIndex.startsWith("Morph")) {
				const id = VpdReader._ConsumeBeforeLineEnding(data, state);
				const weightStmt = VpdReader._ConsumeStatement(data, state);
				const weight = Number(weightStmt);
				if (isNaN(weight)) logger.warn(`Invalid weight: ${weightStmt}`);
				else {
					if (morphs[id] !== void 0) logger.warn(`Duplicate morph: ${id}. Use the last one.`);
					morphs[id] = weight;
				}
			} else logger.warn(`Unknown type: ${typeAndIndex}`);
			state[0] = VpdReader._ConsumeWhileCloseBracket(data, state[0]);
		}
		return {
			bones,
			morphs
		};
	}
	static _ConsumeWhiteSpace(data, index) {
		while (index < data.length && (data[index] === " " || data[index] === "	" || data[index] === "\r" || data[index] === "\n")) index += 1;
		return index;
	}
	static _ConsumeLine(data, index) {
		while (index < data.length) {
			if (data[index] === "\r" || data[index] === "\n") {
				index += 1;
				break;
			}
			index += 1;
		}
		if (data[index - 1] === "\r" && data[index] === "\n") index += 1;
		return index;
	}
	static _ConsumeEmpty(data, index) {
		let oldIndex = index;
		while (index < data.length) {
			oldIndex = index;
			index = VpdReader._ConsumeWhiteSpace(data, index);
			if (data[index] === "/" && data[index + 1] === "/") index = VpdReader._ConsumeLine(data, index);
			if (oldIndex === index) break;
		}
		return index;
	}
	static _ConsumeWhileCloseBracket(data, index) {
		while (index < data.length) {
			if (data[index] === "}") {
				index += 1;
				break;
			}
			index += 1;
		}
		return index;
	}
	static _ConsumeStatement(data, state) {
		let index = state[0];
		let resultString = "";
		for (;;) {
			index = VpdReader._ConsumeWhiteSpace(data, index);
			if (data[index] === "/" && data[index + 1] === "/") {
				index = VpdReader._ConsumeLine(data, index);
				continue;
			}
			if (data.length <= index) break;
			if (data[index] === ";") {
				index += 1;
				break;
			}
			resultString += data[index];
			index += 1;
		}
		state[0] = index;
		return resultString;
	}
	static _ConsumeBeforeLineEnding(data, state) {
		const startIndex = state[0];
		let index = state[0];
		while (index < data.length) {
			if (data[index] === "\r" || data[index] === "\n") break;
			index += 1;
		}
		state[0] = index;
		return data.substring(startIndex, index);
	}
	static _ConsumeBeforeOpenBracket(data, state) {
		let index = state[0];
		let resultString = "";
		while (index < data.length) {
			if (data[index] === "{") {
				index += 1;
				break;
			}
			resultString += data[index];
			index += 1;
		}
		state[0] = index;
		return resultString;
	}
};
//#endregion
//#region src/loaders/vpd-loader.ts
var VPDLoader = class extends Loader {
	constructor(manager) {
		super(manager);
	}
	load(url, onLoad, onProgress, onError) {
		const loader = new FileLoader(this.manager);
		loader.setResponseType("arraybuffer");
		loader.setPath(this.path);
		loader.setRequestHeader(this.requestHeader);
		loader.setWithCredentials(this.withCredentials);
		loader.load(url, (buffer) => {
			try {
				const text = new TextDecoder("shift_jis").decode(buffer);
				onLoad(VpdReader.Parse(text));
			} catch (error) {
				onError?.(error);
			}
		}, onProgress, onError);
	}
	async loadAsync(url, onProgress) {
		return super.loadAsync(url, onProgress);
	}
};
//#endregion
//#region src/utils/apply-vpd.ts
/**
* Applies a static VPD pose to an MMD model.
*
* VPD uses MMD's coordinate system, so the pose is converted to the same
* Three.js coordinate system used by VMD animation tracks before applying it.
*/
const applyVPD = (mmd, vpd, options = {}) => {
	const { grant = true, ik = true, resetPhysics = true, resetPose = true } = options;
	const { mesh } = mmd;
	if (resetPose) mesh.pose();
	const bonesByName = new Map(mesh.skeleton.bones.map((bone) => [bone.name, bone]));
	const position = new Vector3();
	const rotation = new Quaternion();
	for (const [name, transform] of Object.entries(vpd.bones)) {
		const bone = bonesByName.get(name);
		if (bone === void 0) continue;
		if (transform.position !== void 0) {
			position.set(transform.position[0], transform.position[1], -transform.position[2]);
			bone.position.add(position);
		}
		rotation.set(-transform.rotation[0], -transform.rotation[1], transform.rotation[2], transform.rotation[3]);
		bone.quaternion.multiply(rotation);
	}
	const morphTargetDictionary = mesh.morphTargetDictionary;
	for (const [name, weight] of Object.entries(vpd.morphs)) {
		const index = morphTargetDictionary?.[name];
		if (index !== void 0) mesh.morphTargetInfluences[index] = weight;
	}
	mesh.updateMatrixWorld(true);
	mmd.update(0, {
		grant,
		ik,
		physics: false
	});
	if (resetPhysics) mmd.physics?.reset?.();
};
//#endregion
//#region src/utils/build-animation.ts
var AnimationBuilder = class AnimationBuilder {
	static _tempCenter = new Vector3();
	static _tempEuler = new Euler();
	static _tempPosition = new Vector3();
	static _tempQuaternion = new Quaternion();
	/**
	* @param vmd - parsed VMD data
	* @param mesh - tracks will be fitting to mesh
	*/
	build(vmd, mesh) {
		const tracks = this.buildSkeletalAnimation(vmd, mesh).tracks;
		const tracks2 = this.buildMorphAnimation(vmd, mesh).tracks;
		for (let i = 0, il = tracks2.length; i < il; i++) tracks.push(tracks2[i]);
		const clip = new AnimationClip("", -1, tracks);
		const propertyTrack = this.buildPropertyTrack(vmd);
		if (propertyTrack !== void 0) {
			clip.userData.propertyTrack = propertyTrack;
			const lastPropertyFrame = propertyTrack.frameNumbers[propertyTrack.frameNumbers.length - 1];
			clip.duration = Math.max(clip.duration, (lastPropertyFrame + 1) / 30);
		}
		return clip;
	}
	/** @param vmd - parsed VMD data */
	buildCameraAnimation(vmd) {
		const pushVector3 = (array, vec) => {
			array.push(vec.x);
			array.push(vec.y);
			array.push(vec.z);
		};
		const pushQuaternion = (array, q) => {
			array.push(q.x);
			array.push(q.y);
			array.push(q.z);
			array.push(q.w);
		};
		const pushInterpolation = (array, interpolation, index) => {
			array.push(interpolation[index * 4 + 0] / 127);
			array.push(interpolation[index * 4 + 1] / 127);
			array.push(interpolation[index * 4 + 2] / 127);
			array.push(interpolation[index * 4 + 3] / 127);
		};
		const cameras = [];
		for (let i = 0; i < vmd.cameraKeyFrames.length; i++) cameras.push(vmd.cameraKeyFrames.get(i));
		cameras.sort((a, b) => a.frameNumber - b.frameNumber);
		const times = [];
		const centers = [];
		const quaternions = [];
		const positions = [];
		const fovs = [];
		const cInterpolations = [];
		const qInterpolations = [];
		const pInterpolations = [];
		const fInterpolations = [];
		const quaternion = AnimationBuilder._tempQuaternion;
		const euler = AnimationBuilder._tempEuler;
		const position = AnimationBuilder._tempPosition;
		const center = AnimationBuilder._tempCenter;
		for (let i = 0, il = cameras.length; i < il; i++) {
			const motion = cameras[i];
			const time = motion.frameNumber / 30;
			const pos = motion.position;
			const rot = motion.rotation;
			const distance = motion.distance;
			const fov = motion.fov;
			const interpolation = motion.interpolation;
			times.push(time);
			position.set(0, 0, -distance);
			center.set(pos[0], pos[1], pos[2]);
			euler.set(-rot[0], -rot[1], -rot[2], "YXZ");
			quaternion.setFromEuler(euler);
			position.add(center);
			position.applyQuaternion(quaternion);
			pushVector3(centers, center);
			pushQuaternion(quaternions, quaternion);
			pushVector3(positions, position);
			fovs.push(fov);
			for (let j = 0; j < 3; j++) pushInterpolation(cInterpolations, interpolation, j);
			pushInterpolation(qInterpolations, interpolation, 3);
			for (let j = 0; j < 3; j++) pushInterpolation(pInterpolations, interpolation, 4);
			pushInterpolation(fInterpolations, interpolation, 5);
		}
		const tracks = [];
		tracks.push(this._createTrack("target.position", VectorKeyframeTrack, times, centers, cInterpolations));
		tracks.push(this._createTrack(".quaternion", QuaternionKeyframeTrack, times, quaternions, qInterpolations));
		tracks.push(this._createTrack(".position", VectorKeyframeTrack, times, positions, pInterpolations));
		tracks.push(this._createTrack(".fov", NumberKeyframeTrack, times, fovs, fInterpolations));
		return new AnimationClip("", -1, tracks);
	}
	_createTrack(node, TypedKeyframeTrack, times, values, interpolations) {
		if (times.length > 2) {
			times = times.slice();
			values = values.slice();
			interpolations = interpolations.slice();
			const stride = values.length / times.length;
			const interpolateStride = interpolations.length / times.length;
			let index = 1;
			for (let aheadIndex = 2, endIndex = times.length; aheadIndex < endIndex; aheadIndex++) {
				for (let i = 0; i < stride; i++) if (values[index * stride + i] !== values[(index - 1) * stride + i] || values[index * stride + i] !== values[aheadIndex * stride + i]) {
					index++;
					break;
				}
				if (aheadIndex > index) {
					times[index] = times[aheadIndex];
					for (let i = 0; i < stride; i++) values[index * stride + i] = values[aheadIndex * stride + i];
					for (let i = 0; i < interpolateStride; i++) interpolations[index * interpolateStride + i] = interpolations[aheadIndex * interpolateStride + i];
				}
			}
			times.length = index + 1;
			values.length = (index + 1) * stride;
			interpolations.length = (index + 1) * interpolateStride;
		}
		const track = new TypedKeyframeTrack(node, times, values);
		track.createInterpolant = function InterpolantFactoryMethodCubicBezier(result) {
			return new CubicBezierInterpolation(this.times, this.values, this.getValueSize(), result ?? void 0, new Float32Array(interpolations));
		};
		return track;
	}
	/**
	* @param vmd - parsed VMD data
	* @param mesh - tracks will be fitting to mesh
	*/
	buildMorphAnimation(vmd, mesh) {
		const tracks = [];
		const morphs = {};
		const morphTargetDictionary = mesh.morphTargetDictionary;
		for (let i = 0; i < vmd.morphKeyFrames.length; i++) {
			const morph = vmd.morphKeyFrames.get(i);
			const morphName = morph.morphName;
			if (morphTargetDictionary[morphName] == null) continue;
			morphs[morphName] = morphs[morphName] ?? [];
			morphs[morphName].push(morph);
		}
		for (const [key, array] of Object.entries(morphs)) {
			array.sort((a, b) => a.frameNumber - b.frameNumber);
			const times = [];
			const values = [];
			for (let i = 0, il = array.length; i < il; i++) {
				times.push(array[i].frameNumber / 30);
				values.push(array[i].weight);
			}
			tracks.push(new NumberKeyframeTrack(`.morphTargetInfluences[${morphTargetDictionary[key]}]`, times, values));
		}
		return new AnimationClip("", -1, tracks);
	}
	buildPropertyTrack(vmd) {
		const propertyKeyFrames = Array.from(vmd.propertyKeyFrames);
		if (propertyKeyFrames.length === 0) return void 0;
		propertyKeyFrames.sort((a, b) => a.frameNumber - b.frameNumber);
		const frames = [];
		for (const propertyKeyFrame of propertyKeyFrames) if (frames[frames.length - 1]?.frameNumber === propertyKeyFrame.frameNumber) frames[frames.length - 1] = propertyKeyFrame;
		else frames.push(propertyKeyFrame);
		const ikBoneNames = [];
		const ikBoneNameIndices = /* @__PURE__ */ new Map();
		for (const propertyKeyFrame of frames) for (const [ikBoneName] of propertyKeyFrame.ikStates) {
			if (ikBoneNameIndices.has(ikBoneName)) continue;
			ikBoneNameIndices.set(ikBoneName, ikBoneNames.length);
			ikBoneNames.push(ikBoneName);
		}
		if (ikBoneNames.length === 0) return void 0;
		const currentStates = Array.from({ length: ikBoneNames.length }).fill(false);
		const frameNumbers = [];
		const ikStates = ikBoneNames.map(() => []);
		for (const propertyKeyFrame of frames) {
			frameNumbers.push(propertyKeyFrame.frameNumber);
			for (const [ikBoneName, enabled] of propertyKeyFrame.ikStates) currentStates[ikBoneNameIndices.get(ikBoneName)] = enabled;
			for (let i = 0; i < currentStates.length; i++) ikStates[i].push(currentStates[i]);
		}
		return {
			frameNumbers,
			ikBoneNames,
			ikStates
		};
	}
	/**
	* @param vmd - parsed VMD data
	* @param mesh - tracks will be fitting to mesh
	*/
	buildSkeletalAnimation(vmd, mesh) {
		const pushInterpolation = (array, interpolation, index) => {
			array.push(interpolation[index + 0] / 127);
			array.push(interpolation[index + 8] / 127);
			array.push(interpolation[index + 4] / 127);
			array.push(interpolation[index + 12] / 127);
		};
		const tracks = [];
		const motions = {};
		const bones = mesh.skeleton.bones;
		const boneNameDictionary = {};
		for (let i = 0, il = bones.length; i < il; i++) boneNameDictionary[bones[i].name] = true;
		for (let i = 0; i < vmd.boneKeyFrames.length; i++) {
			const motion = vmd.boneKeyFrames.get(i);
			const boneName = motion.boneName;
			if (boneNameDictionary[boneName] == null) continue;
			motions[boneName] = motions[boneName] ?? [];
			motions[boneName].push(motion);
		}
		for (const [key, array] of Object.entries(motions)) {
			array.sort((a, b) => a.frameNumber - b.frameNumber);
			const times = [];
			const positions = [];
			const rotations = [];
			const pInterpolations = [];
			const rInterpolations = [];
			const basePosition = mesh.skeleton.getBoneByName(key).position.toArray();
			for (let i = 0, il = array.length; i < il; i++) {
				const time = array[i].frameNumber / 30;
				const position = array[i].position;
				const rotation = array[i].rotation;
				const interpolation = array[i].interpolation;
				times.push(time);
				positions.push(basePosition[0] + position[0]);
				positions.push(basePosition[1] + position[1]);
				positions.push(basePosition[2] - position[2]);
				rotations.push(-rotation[0]);
				rotations.push(-rotation[1]);
				rotations.push(rotation[2]);
				rotations.push(rotation[3]);
				for (let j = 0; j < 3; j++) pushInterpolation(pInterpolations, interpolation, j);
				pushInterpolation(rInterpolations, interpolation, 3);
			}
			const targetName = `.bones[${key}]`;
			tracks.push(this._createTrack(`${targetName}.position`, VectorKeyframeTrack, times, positions, pInterpolations));
			tracks.push(this._createTrack(`${targetName}.quaternion`, QuaternionKeyframeTrack, times, rotations, rInterpolations));
		}
		return new AnimationClip("", -1, tracks);
	}
};
var CubicBezierInterpolation = class extends Interpolant {
	interpolationParams;
	_lastResult = 0;
	_lastX = -1;
	_lastX1 = -1;
	_lastX2 = -1;
	_lastY1 = -1;
	_lastY2 = -1;
	constructor(parameterPositions, sampleValues, sampleSize, resultBuffer, params) {
		super(parameterPositions, sampleValues, sampleSize, resultBuffer);
		this.interpolationParams = params;
	}
	_calculate(x1, x2, y1, y2, x) {
		if (x === this._lastX && x1 === this._lastX1 && x2 === this._lastX2 && y1 === this._lastY1 && y2 === this._lastY2) return this._lastResult;
		if (x1 === y1 && x2 === y2) {
			this._lastX1 = x1;
			this._lastX2 = x2;
			this._lastY1 = y1;
			this._lastY2 = y2;
			this._lastX = x;
			this._lastResult = x;
			return x;
		}
		const cx = 3 * x1;
		const bx = 3 * (x2 - x1) - cx;
		const ax = 1 - cx - bx;
		let t = x;
		let tMin = 0;
		let tMax = 1;
		for (let i = 0; i < 8; i++) {
			const ft = ((ax * t + bx) * t + cx) * t - x;
			if (Math.abs(ft) < 1e-6) break;
			const dft = (3 * ax * t + 2 * bx) * t + cx;
			if (Math.abs(dft) < 1e-6) break;
			const tNext = t - ft / dft;
			if (tNext < tMin || tNext > tMax) break;
			t = tNext;
		}
		let ft = ((ax * t + bx) * t + cx) * t - x;
		if (Math.abs(ft) >= 1e-6) {
			t = x;
			for (let i = 0; i < 16; i++) {
				ft = ((ax * t + bx) * t + cx) * t - x;
				if (Math.abs(ft) < 1e-6) break;
				if (ft > 0) tMax = t;
				else tMin = t;
				t = (tMin + tMax) * .5;
			}
		}
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const cy = 3 * y1;
		const by = 3 * (y2 - y1) - cy;
		const res = (((1 - cy - by) * t + by) * t + cy) * t;
		this._lastX1 = x1;
		this._lastX2 = x2;
		this._lastY1 = y1;
		this._lastY2 = y2;
		this._lastX = x;
		this._lastResult = res;
		return res;
	}
	interpolate_(i1, t0, t, t1) {
		const result = this.resultBuffer;
		const values = this.sampleValues;
		const stride = this.valueSize;
		const params = this.interpolationParams;
		const offset1 = i1 * stride;
		const offset0 = offset1 - stride;
		const weight1 = t1 - t0 < 1 / 30 * 1.5 ? 0 : (t - t0) / (t1 - t0);
		if (stride === 4) {
			const x1 = params[i1 * 4 + 0];
			const x2 = params[i1 * 4 + 1];
			const y1 = params[i1 * 4 + 2];
			const y2 = params[i1 * 4 + 3];
			const ratio = this._calculate(x1, x2, y1, y2, weight1);
			Quaternion.slerpFlat(result, 0, values, offset0, values, offset1, ratio);
		} else if (stride === 3) for (let i = 0; i < stride; ++i) {
			const x1 = params[i1 * 12 + i * 4 + 0];
			const x2 = params[i1 * 12 + i * 4 + 1];
			const y1 = params[i1 * 12 + i * 4 + 2];
			const y2 = params[i1 * 12 + i * 4 + 3];
			const ratio = this._calculate(x1, x2, y1, y2, weight1);
			result[i] = values[offset0 + i] * (1 - ratio) + values[offset1 + i] * ratio;
		}
		else {
			const x1 = params[i1 * 4 + 0];
			const x2 = params[i1 * 4 + 1];
			const y1 = params[i1 * 4 + 2];
			const y2 = params[i1 * 4 + 3];
			const ratio = this._calculate(x1, x2, y1, y2, weight1);
			result[0] = values[offset0] * (1 - ratio) + values[offset1] * ratio;
		}
		return result;
	}
};
/**
* @param vmd - parsed VMD data
* @param mesh - tracks will be fitting to mesh
*/
const buildAnimation = (vmd, mesh) => new AnimationBuilder().build(vmd, mesh);
/** @param vmd - parsed VMD data */
const buildCameraAnimation = (vmd) => new AnimationBuilder().buildCameraAnimation(vmd);
//#endregion
//#region src/utils/mmd-animation-manager.ts
const playAnimation = (mixer, animation, duration) => {
	if (animation == null) return;
	(Array.isArray(animation) ? animation : [animation]).forEach((clip) => {
		if (duration != null) {
			clip = clip.clone();
			clip.duration = duration;
		}
		mixer.clipAction(clip).play();
	});
};
/** Coordinates MMD, camera, and audio animation on a single render-loop update. */
var MMDAnimationManager = class {
	audio;
	audioDelay = 0;
	audioDuration;
	audioElapsed = 0;
	audioStarted = false;
	audioStartedByManager = false;
	camera;
	cameraMixer;
	cameraTarget;
	duration;
	models = /* @__PURE__ */ new Map();
	constructor(options = {}) {
		if (options.duration != null && (!Number.isFinite(options.duration) || options.duration <= 0)) throw new RangeError("MMDAnimationManager: duration must be a positive finite number.");
		this.duration = options.duration;
	}
	add(object, options = {}) {
		if (object instanceof MMD) {
			if (this.models.has(object)) throw new Error("MMDAnimationManager: MMD has already been added.");
			const mmdOptions = options;
			const mixer = new AnimationMixer(object.mesh);
			const { animation } = mmdOptions;
			this.models.set(object, mixer);
			playAnimation(mixer, animation, this.duration);
			return this;
		} else if ("isCamera" in object) {
			if (this.camera !== void 0) throw new Error("MMDAnimationManager: Camera has already been added.");
			const cameraOptions = options;
			this.camera = object;
			if (cameraOptions.animation != null) {
				const target = new Object3D();
				target.name = "target";
				object.add(target);
				this.cameraTarget = target;
				this.cameraMixer = new AnimationMixer(object);
				playAnimation(this.cameraMixer, cameraOptions.animation, this.duration);
			}
			return this;
		} else if (object.type === "Audio") {
			if (this.audio !== void 0) throw new Error("MMDAnimationManager: Audio has already been added.");
			const audioOptions = options;
			this.audio = object;
			this.audioDelay = audioOptions.delayTime ?? 0;
			this.audioDuration = object.buffer?.duration;
			this.audioElapsed = 0;
			this.audioStarted = object.isPlaying;
			this.audioStartedByManager = false;
			return this;
		} else throw new TypeError("MMDAnimationManager.add: expected an MMD, Camera, or Audio.");
	}
	dispose() {
		for (const mmd of this.models.keys()) this.remove(mmd);
		if (this.camera !== void 0) this.remove(this.camera);
		if (this.audio !== void 0) this.remove(this.audio);
	}
	remove(object) {
		if (object instanceof MMD) {
			const mixer = this.models.get(object);
			if (mixer == null) return this;
			mixer.stopAllAction();
			object.updateAnimation();
			mixer.uncacheRoot(object.mesh);
			this.models.delete(object);
			return this;
		} else if ("isCamera" in object) {
			if (this.camera !== object) return this;
			if (this.cameraMixer != null) {
				this.cameraMixer.stopAllAction();
				this.cameraMixer.uncacheRoot(object);
			}
			if (this.cameraTarget?.parent === object) object.remove(this.cameraTarget);
			this.camera = void 0;
			this.cameraMixer = void 0;
			this.cameraTarget = void 0;
			return this;
		} else if (object.type === "Audio") {
			if (this.audio !== object) return this;
			if (this.audioStartedByManager && object.isPlaying) object.stop();
			this.audio = void 0;
			this.audioDelay = 0;
			this.audioDuration = void 0;
			this.audioElapsed = 0;
			this.audioStarted = false;
			this.audioStartedByManager = false;
			return this;
		} else throw new Error("MMDAnimationManager.remove: expected an MMD, Camera, or Audio.");
	}
	update(delta, options) {
		this.updateAudio(delta);
		for (const [mmd, mixer] of this.models) this.updateMMD(mmd, mixer, delta, options);
		if (this.camera != null && this.cameraMixer != null && this.cameraTarget != null) {
			this.cameraMixer.update(delta);
			this.camera.updateProjectionMatrix?.();
			this.camera.up.set(0, 1, 0);
			this.camera.up.applyQuaternion(this.camera.quaternion);
			this.camera.lookAt(this.cameraTarget.position);
		}
		return this;
	}
	updateAudio(delta) {
		if (this.audio == null) return;
		this.audioElapsed += delta;
		if (this.duration != null) while (this.audioElapsed >= this.duration) {
			this.audioElapsed -= this.duration;
			if (this.audio.isPlaying) this.audio.stop();
			this.audioStarted = false;
			this.audioStartedByManager = false;
		}
		const audioEnd = this.audioDuration == null ? Number.POSITIVE_INFINITY : this.audioDelay + this.audioDuration;
		if (!this.audioStarted && this.audioElapsed >= this.audioDelay && this.audioElapsed <= audioEnd) {
			this.audioStarted = true;
			if (!this.audio.isPlaying) {
				this.audio.play();
				this.audioStartedByManager = true;
			}
		}
	}
	updateMMD(mmd, mixer, delta, options) {
		let skeletalAnimationLooped = false;
		const onLoop = (event) => {
			if (!event.action.getClip().tracks.some((track) => track.name.startsWith(".bones"))) return;
			skeletalAnimationLooped = true;
		};
		mmd.beforeUpdate();
		mixer.addEventListener("loop", onLoop);
		try {
			mixer.update(delta);
		} finally {
			mixer.removeEventListener("loop", onLoop);
		}
		mmd.updateAnimation(mixer);
		mmd.beforePhysics(options);
		if (skeletalAnimationLooped) mmd.physics?.reset?.();
		if (options?.physics !== false) mmd.physics?.update(delta);
		mmd.afterPhysics(options);
	}
};
//#endregion
export { GrantSolver, MMD, MMDAnimationManager, MMDIKHelper, MMDIKSolver, MMDLoader, MMDMaterialPlugin, PmxObject, VMDLoader, VPDLoader, VmdObject, applyVPD, buildAnimation, buildCameraAnimation, createPhysicsPlugin };
