/*
  Warnings:

  - You are about to drop the column `embedding_vec` on the `faces` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."faces_embedding_vec_hnsw_idx";

-- DropIndex
DROP INDEX "public"."person_prototypes_vec_hnsw_idx";

-- AlterTable
ALTER TABLE "public"."faces" DROP COLUMN "embedding_vec";
