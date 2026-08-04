-- DropIndex
DROP INDEX "User_address_idx";

-- CreateIndex
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");
