/*
  Warnings:

  - A unique constraint covering the columns `[userID,marketID,type]` on the table `Position` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Position_userID_marketID_type_key" ON "Position"("userID", "marketID", "type");
