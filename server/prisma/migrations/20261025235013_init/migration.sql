-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PLAYER');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('LOBBY', 'VOTING_FORMAT', 'VOTING_THEME', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('BRACKET', 'LEAGUE', 'GROUP_STAGE', 'LEAGUE_PLAYOFFS', 'DOUBLE_ELIMINATION');

-- CreateEnum
CREATE TYPE "MatchFormat" AS ENUM ('SINGLE_MATCH', 'TWO_LEGGED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING_SUBMISSION', 'PENDING_CONFIRMATION', 'CLOSED');

-- CreateEnum
CREATE TYPE "VotePhase" AS ENUM ('FORMAT', 'THEME');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "playerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhitelistEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "playerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhitelistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'LOBBY',
    "format" "TournamentFormat",
    "matchFormat" "MatchFormat",
    "theme" TEXT,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB,
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentParticipant" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamName" TEXT,
    "seed" INTEGER,
    "isPresent" BOOLEAN NOT NULL DEFAULT true,
    "isWalkover" BOOLEAN NOT NULL DEFAULT false,
    "walkoverAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "leg" INTEGER NOT NULL DEFAULT 1,
    "seriesId" TEXT,
    "homeParticipantId" TEXT NOT NULL,
    "awayParticipantId" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING_SUBMISSION',
    "isBye" BOOLEAN NOT NULL DEFAULT false,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "homeYellowCards" INTEGER NOT NULL DEFAULT 0,
    "awayYellowCards" INTEGER NOT NULL DEFAULT 0,
    "homeRedCards" INTEGER NOT NULL DEFAULT 0,
    "awayRedCards" INTEGER NOT NULL DEFAULT 0,
    "penaltiesWinnerId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedByParticipantId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentVote" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "phase" "VotePhase" NOT NULL,
    "choice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalStats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "matchesWon" INTEGER NOT NULL DEFAULT 0,
    "matchesDrawn" INTEGER NOT NULL DEFAULT 0,
    "matchesLost" INTEGER NOT NULL DEFAULT 0,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "podiums" INTEGER NOT NULL DEFAULT 0,
    "firstPlaces" INTEGER NOT NULL DEFAULT 0,
    "secondPlaces" INTEGER NOT NULL DEFAULT 0,
    "thirdPlaces" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeadToHeadRecord" (
    "id" TEXT NOT NULL,
    "playerAId" TEXT NOT NULL,
    "playerBId" TEXT NOT NULL,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "winsA" INTEGER NOT NULL DEFAULT 0,
    "winsB" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "goalsA" INTEGER NOT NULL DEFAULT 0,
    "goalsB" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeadToHeadRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualRankingEntry" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "tournamentsPlayed" INTEGER NOT NULL DEFAULT 0,
    "podiums" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualRankingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_playerId_key" ON "User"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "WhitelistEntry_email_key" ON "WhitelistEntry"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Player_firstName_lastName_key" ON "Player"("firstName", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentParticipant_tournamentId_playerId_key" ON "TournamentParticipant"("tournamentId", "playerId");

-- CreateIndex
CREATE INDEX "Match_tournamentId_round_idx" ON "Match"("tournamentId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentVote_tournamentId_participantId_phase_key" ON "TournamentVote"("tournamentId", "participantId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalStats_playerId_key" ON "HistoricalStats"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "HeadToHeadRecord_playerAId_playerBId_key" ON "HeadToHeadRecord"("playerAId", "playerBId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualRankingEntry_year_playerId_key" ON "AnnualRankingEntry"("year", "playerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeParticipantId_fkey" FOREIGN KEY ("homeParticipantId") REFERENCES "TournamentParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayParticipantId_fkey" FOREIGN KEY ("awayParticipantId") REFERENCES "TournamentParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_penaltiesWinnerId_fkey" FOREIGN KEY ("penaltiesWinnerId") REFERENCES "TournamentParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentVote" ADD CONSTRAINT "TournamentVote_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalStats" ADD CONSTRAINT "HistoricalStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadToHeadRecord" ADD CONSTRAINT "HeadToHeadRecord_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadToHeadRecord" ADD CONSTRAINT "HeadToHeadRecord_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualRankingEntry" ADD CONSTRAINT "AnnualRankingEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
