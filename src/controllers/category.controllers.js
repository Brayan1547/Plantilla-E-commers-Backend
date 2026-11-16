import {
    dbCreateCategory,
    dbGetCategories,
    dbGetCategoryById,
    dbGetPublicCategories,
    dbGetPublicCategoryById,
    dbUpdateCategoryById,
    dbSetCategoryImage,
    dbClearCategoryImage,
    dbDeleteCategoryById
 } from "../services/category.service.js";
import { dbProductsUseCategory } from "../services/product.services.js";
import { CATEGORY_UPDATABLE_FIELDS, ROLES } from "../config/global.config.js";
import { isValidObjectId, pickAllowed } from "../helpers/validation.helpers.js";
import { sendWriteError } from "../helpers/writeError.helper.js";
import { cloudinaryImageService } from "../services/cloudinaryImage.service.js";
import {
    MAX_IMAGE_DIMENSION_PX,
    MIN_IMAGE_DIMENSION_PX,
    detectImageSignature,
    extensionMatchesFormat,
    multerErrorMessage,
    parseSingleImageUpload,
    readImageDimensions,
} from "../helpers/imageUpload.helper.js";

// F7-C — mismo conjunto de roles "admin-capable" que `product.controllers.js`
// (duplicado a propósito, no importado desde ahí: son controllers hermanos
// sin un módulo compartido hoy, y esto es una lista de 3 constantes, no vale
// la pena un refactor cruzado fuera del alcance de F7). Un `subscriber` o una
// request anónima NUNCA caen en la rama administrativa de categorías.
const ADMIN_CAPABLE_ROLES = [ROLES.ADMIN, ROLES.SHOP_MANAGER, ROLES.EDITOR];
const isAdminCapable = (role) => ADMIN_CAPABLE_ROLES.includes(role);


const createCategory = async (req, res) => {
    try {
        const inputData = req.body
        const data = await dbCreateCategory(inputData)
        res.json({
            msg: "se registra la categoria",
            data
        })
    } catch (error) {
        return sendWriteError(res, error, "categoria");
    }
}

// F7-CLOSURE — `GET /category` sigue EXACTAMENTE el mismo contrato que
// `GET /product` (ver `product.controllers.js` -> `getProduct`): el acceso
// ampliado (categorías inactivas incluidas) exige DOS condiciones a la vez,
//   1. `?all=true` explícito en la query — la INTENCIÓN de pedir el listado
//      completo tiene que ser deliberada del consumidor, y
//   2. rol admin-capable (`isAdminCapable`, resuelto vía `optionalAuthentication`).
// Sin AMBAS, la respuesta es el contrato público (`dbGetPublicCategories`,
// solo `isActive:true`) — da igual que el `authInterceptor` global del
// frontend adjunte un `x-token` válido a una request del storefront: recibir
// autenticación NO basta, hace falta el `?all=true`. `?all=true` por sí solo
// tampoco amplía nada: un rol no administrativo (o anónimo) que lo mande
// cae igualmente en la rama pública (mismo patrón que Product, nunca 403).
//
// Consumidores:
//   · storefront (`basicos.ts`, `category-list.ts`, `HttpCategory`) — NUNCA
//     manda `?all=true` -> siempre contrato público.
//   · panel admin (`AdminCategoriesApi.list()`, usado también por
//     `product-list.page`, `inventory.page` y el selector de
//     `product-form.page` — incluido el rol `editor`) — manda `?all=true`
//     para ver también las inactivas.
const getCategory = async (req, res) => {
    try {
        const role = req.user?.role;
        const wantsAll = req.query.all === "true";
        const data = wantsAll && isAdminCapable(role)
            ? await dbGetCategories()
            : await dbGetPublicCategories();
        res.json({
            msg: "Se obtiene listado por categoria",
            data,
        });
    } catch (error) {
        console.error(`Error al listar categorias -> ${error && error.name}`);
        res.status(500).json({
            msg: "Ocurrio un error al obtner la categoria"
        });
    }
}

// F7-CLOSURE — misma regla que la lista y que `GET /product/:id`: el detalle
// de una categoría inactiva solo se sirve con `?all=true` + rol admin-capable
// a la vez. Cualquier otro caso (anónimo, rol no administrativo, o
// admin-capable SIN `?all=true`) recibe el contrato público: una categoría
// inactiva responde 404, igual que un producto no publicado (Regla §25: "no
// encontrado" cubre tanto "no existe" como "no es públicamente visible", sin
// filtrar más en el cliente). `?all=true` sin rol admin-capable NO abre nada.
const getCategoryById = async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ msg: "El ID de la categoría no es válido" });
        }
        const role = req.user?.role;
        const wantsAll = req.query.all === "true";
        const data = wantsAll && isAdminCapable(role)
            ? await dbGetCategoryById(id)
            : await dbGetPublicCategoryById(id);
        if (!data) {
            return res.status(404).json({ msg: "La categoría no se encuentra registrada" });
        }
        res.json({
            msg: "Se obtiene una categoria por ID",
            data
        });
    } catch (error) {
        console.error(`Error al obtener categoria por ID -> ${error && error.name}`);
        res.status(500).json({
            msg: "Ocurrio un error al obtener la categoria por ID"
        });
    }

}

const updateCategoryById = async (req, res) => {
    try {
        const id = req.params.id;

        // FASE 2 / S4 y REGLA 8: el ID debe ser un ObjectId valido.
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                msg: "El ID de la categoría no es válido"
            });
        }

        // FASE 2 / S4: lista blanca por construccion. El cliente NO controla
        // que campos ni que operadores llegan a la actualizacion. Cualquier
        // clave fuera de CATEGORY_UPDATABLE_FIELDS (incluidos $set, $unset,
        // $rename, etc.) se descarta aqui.
        const safePayload = pickAllowed(req.body, CATEGORY_UPDATABLE_FIELDS);

        if (Object.keys(safePayload).length === 0) {
            return res.status(400).json({
                msg: "No se enviaron campos válidos para actualizar"
            });
        }

        const data = await dbUpdateCategoryById(id, safePayload);

        if (!data) {
            return res.status(404).json({
                msg: "La categoría no se encuentra registrada"
            });
        }

        res.json({
            msg: "Se actuliza categoria por ID",
            data
        });
    } catch (error) {
        return sendWriteError(res, error, "categoria");
    }
}

// POST /category/:id/image — sube/reemplaza la imagen de portada de la categoría.
const uploadCategoryImage = async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ msg: "El ID de la categoría no es válido" });
        }
        const category = await dbGetCategoryById(id);
        if (!category) {
            return res.status(404).json({ msg: "La categoría no se encuentra registrada" });
        }

        try {
            await parseSingleImageUpload(req, res);
        } catch (uploadErr) {
            return res.status(400).json({ msg: multerErrorMessage(uploadErr) });
        }
        if (!req.file) {
            return res.status(400).json({ msg: "Debes seleccionar un archivo de imagen." });
        }

        const format = detectImageSignature(req.file.buffer);
        if (!format || !extensionMatchesFormat(req.file.originalname, format)) {
            return res.status(400).json({ msg: "Tipo de archivo no permitido. Usa JPEG, PNG o WEBP." });
        }
        const dims = readImageDimensions(req.file.buffer, format);
        if (!dims) {
            return res.status(400).json({ msg: "El archivo de imagen está dañado o no se pudo procesar." });
        }
        if (dims.width < MIN_IMAGE_DIMENSION_PX || dims.height < MIN_IMAGE_DIMENSION_PX) {
            return res.status(400).json({ msg: `La imagen es demasiado pequeña (mínimo ${MIN_IMAGE_DIMENSION_PX}x${MIN_IMAGE_DIMENSION_PX} píxeles).` });
        }
        if (dims.width > MAX_IMAGE_DIMENSION_PX || dims.height > MAX_IMAGE_DIMENSION_PX) {
            return res.status(400).json({ msg: `La imagen supera las dimensiones máximas permitidas (${MAX_IMAGE_DIMENSION_PX}x${MAX_IMAGE_DIMENSION_PX} píxeles).` });
        }

        let uploaded;
        try {
            uploaded = await cloudinaryImageService.upload(req.file.buffer, "categories");
        } catch (cloudErr) {
            console.error(`uploadCategoryImage -> cloudinary failed: ${cloudErr && cloudErr.name}`);
            return res.status(502).json({ msg: "No fue posible subir la imagen. Inténtalo nuevamente." });
        }

        const oldPublicId = category.image?.publicId;
        let data;
        try {
            data = await dbSetCategoryImage(id, { url: uploaded.url, publicId: uploaded.publicId });
        } catch (dbErr) {
            await cloudinaryImageService.destroy(uploaded.publicId); // evita huérfanos
            throw dbErr;
        }
        if (oldPublicId) await cloudinaryImageService.destroy(oldPublicId); // best-effort

        res.json({ msg: "Imagen de categoría actualizada", data });
    } catch (error) {
        return sendWriteError(res, error, "imagen de la categoría");
    }
}

// DELETE /category/:id/image — quita la imagen (el home vuelve a la imagen por defecto).
const deleteCategoryImage = async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ msg: "El ID de la categoría no es válido" });
        }
        const category = await dbGetCategoryById(id);
        if (!category) {
            return res.status(404).json({ msg: "La categoría no se encuentra registrada" });
        }
        const publicId = category.image?.publicId;
        const data = await dbClearCategoryImage(id);
        if (publicId) await cloudinaryImageService.destroy(publicId);
        res.json({ msg: "Imagen de categoría eliminada", data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: "Ocurrio un error al eliminar la imagen" });
    }
}

const deleteCategoryById = async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ msg: "El ID de la categoría no es válido" });
        }

        // FASE 3 — Product Domain: no se elimina una categoria que este en uso
        // (Regla §14: "no eliminar categorias que esten siendo utilizadas sin
        // definir comportamiento seguro"). El mecanismo seguro para retirarla
        // es desactivarla (`isActive:false`), no borrarla.
        const inUse = await dbProductsUseCategory(id);
        if (inUse) {
            return res.status(409).json({
                msg: "No se puede eliminar: hay productos que usan esta categoría. Desactívala en su lugar (isActive:false)."
            });
        }

        const data = await dbDeleteCategoryById(id);
        if (data?.image?.publicId) await cloudinaryImageService.destroy(data.image.publicId);
        res.json({
            msg: "Se elimina categoria por ID",
            data,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            msg: "Ocurrio un error al eliminar categoria"
        });
    }
}

export {
    createCategory,
    getCategory,
    getCategoryById,
    updateCategoryById,
    uploadCategoryImage,
    deleteCategoryImage,
    deleteCategoryById,
}