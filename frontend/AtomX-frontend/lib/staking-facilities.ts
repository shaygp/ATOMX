export interface ValidatorInfo {
  activatedStake: number;
  commission: number;
  epochCredits: number[][];
  epochVoteAccount: boolean;
  lastVote: number;
  nodePubkey: string;
  rootSlot: number;
  votePubkey: string;
}

export interface EpochInfo {
  absoluteSlot: number;
  blockHeight: number;
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  transactionCount: number;
}

export interface VoteAccountsResponse {
  current: ValidatorInfo[];
  delinquent: ValidatorInfo[];
}

class StakingFacilitiesAPI {
  private async makeRequest(method: string, params: any[] = []): Promise<any> {
    const response = await fetch('/api/staking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    return data.result;
  }

  async getHealth(): Promise<string> {
    return this.makeRequest('getHealth');
  }

  async getEpochInfo(): Promise<EpochInfo> {
    return this.makeRequest('getEpochInfo');
  }

  async getVoteAccounts(): Promise<VoteAccountsResponse> {
    return this.makeRequest('getVoteAccounts');
  }

  async getStakingStats() {
    const [epochInfo, voteAccounts] = await Promise.all([
      this.getEpochInfo(),
      this.getVoteAccounts()
    ]);

    const activeValidators = voteAccounts.current.length;
    const delinquentValidators = voteAccounts.delinquent.length;
    const totalValidators = activeValidators + delinquentValidators;

    const totalActiveStake = voteAccounts.current.reduce(
      (sum, validator) => sum + validator.activatedStake, 0
    );

    const totalDelinquentStake = voteAccounts.delinquent.reduce(
      (sum, validator) => sum + validator.activatedStake, 0
    );

    const totalStake = totalActiveStake + totalDelinquentStake;
    const averageCommission = voteAccounts.current.reduce(
      (sum, validator) => sum + validator.commission, 0
    ) / activeValidators;

    return {
      epoch: epochInfo.epoch,
      slot: epochInfo.absoluteSlot,
      blockHeight: epochInfo.blockHeight,
      transactionCount: epochInfo.transactionCount,
      totalValidators,
      activeValidators,
      delinquentValidators,
      totalStake: totalStake / 1e9, // Convert to SOL
      totalActiveStake: totalActiveStake / 1e9,
      totalDelinquentStake: totalDelinquentStake / 1e9,
      averageCommission: Math.round(averageCommission * 100) / 100,
      networkHealth: delinquentValidators / totalValidators < 0.1 ? 'Healthy' : 'Warning',
    };
  }
}

export const stakingAPI = new StakingFacilitiesAPI();