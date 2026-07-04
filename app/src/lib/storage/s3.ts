import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { loadStorageEnv, type StorageEnv } from '@veriterra/shared';

// Client de stockage objet (MinIO / S3, auto-hébergé) pour les pièces jointes des terrains.
// MinIO reste sur le réseau interne : l'app est le seul intermédiaire (upload et download
// passent par elle, jamais d'URL présignée exposée au navigateur). Le module est chargé
// paresseusement : l'app démarre sans stockage et n'échoue (avec un message lisible) que si
// une opération est tentée alors que le stockage n'est pas configuré.

let cachedConfig: StorageEnv | undefined;
let cachedClient: S3Client | undefined;
let ensured: Promise<void> | undefined;

function getConfig(): StorageEnv {
  if (cachedConfig) return cachedConfig;
  const env = loadStorageEnv();
  if (!env) {
    throw new Error(
      'Stockage objet non configuré : renseigner S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY.',
    );
  }
  cachedConfig = env;
  return env;
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const cfg = getConfig();
  cachedClient = new S3Client({
    endpoint: cfg.S3_ENDPOINT,
    region: cfg.S3_REGION,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: cfg.S3_ACCESS_KEY_ID,
      secretAccessKey: cfg.S3_SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

/** Taille maximale d'un fichier déposé, en octets (issue de la config, bornée aussi en route). */
export function maxUploadBytes(): number {
  return getConfig().S3_MAX_UPLOAD_MB * 1024 * 1024;
}

/** Quota de stockage agrégé par organisation, en octets. 0 => illimité (quota désactivé). */
export function orgStorageQuotaBytes(): number {
  return getConfig().S3_ORG_QUOTA_MB * 1024 * 1024;
}

/**
 * Vrai si ajouter `incomingBytes` ferait dépasser le quota de l'organisation. `quotaBytes <= 0`
 * signifie illimité (jamais dépassé). Fonction pure et testable (le calcul du total courant et le
 * garde vivent dans `createDocument`).
 */
export function wouldExceedOrgQuota(currentBytes: number, incomingBytes: number, quotaBytes: number): boolean {
  if (quotaBytes <= 0) return false;
  return currentBytes + incomingBytes > quotaBytes;
}

/**
 * Taille max en Mo pour l'affichage. Ne throw JAMAIS : repli à 25 si le stockage n'est pas
 * configuré OU s'il l'est partiellement (`loadStorageEnv` lève dans ce cas). La fiche terrain
 * appelle ceci en rendu serveur ; une config de stockage incomplète ne doit pas casser une page
 * de lecture (l'upload, lui, échoue proprement en 503 côté route).
 */
export function maxUploadMbForDisplay(): number {
  try {
    return loadStorageEnv()?.S3_MAX_UPLOAD_MB ?? 25;
  } catch {
    return 25;
  }
}

/** Crée le bucket s'il n'existe pas. Idempotent et mémoïsé (une seule vérification par process). */
export function ensureBucket(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const client = getClient();
    const Bucket = getConfig().S3_BUCKET;
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
    } catch {
      // Absent (ou inaccessible) : on tente la création. Une course entre deux process peut
      // renvoyer "déjà possédé", que l'on ignore.
      try {
        await client.send(new CreateBucketCommand({ Bucket }));
      } catch (e) {
        const name = (e as { name?: string }).name ?? '';
        if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
          ensured = undefined; // laisse un prochain appel réessayer
          throw e;
        }
      }
    }
  })();
  return ensured;
}

/** Écrit un objet (crée le bucket au besoin). */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  await getClient().send(
    new PutObjectCommand({
      Bucket: getConfig().S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Lit un objet en flux (pour proxifier le download sans tout charger en mémoire). */
export async function getObjectStream(
  key: string,
): Promise<{ body: ReadableStream<Uint8Array>; contentLength?: number }> {
  const out = await getClient().send(new GetObjectCommand({ Bucket: getConfig().S3_BUCKET, Key: key }));
  if (!out.Body) throw new Error(`Objet introuvable: ${key}`);
  return {
    body: (out.Body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream(),
    contentLength: out.ContentLength,
  };
}

/** Lit un objet entièrement en mémoire (tests, petits fichiers). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const out = await getClient().send(new GetObjectCommand({ Bucket: getConfig().S3_BUCKET, Key: key }));
  if (!out.Body) throw new Error(`Objet introuvable: ${key}`);
  return (out.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
}

/** Supprime un objet (idempotent côté S3 : supprimer un objet absent ne throw pas). */
export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: getConfig().S3_BUCKET, Key: key }));
}

/** Réinitialise les singletons (tests). */
export function resetStorageForTests(): void {
  cachedConfig = undefined;
  cachedClient = undefined;
  ensured = undefined;
}
