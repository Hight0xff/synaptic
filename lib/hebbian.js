'use strict';

const NeuronStore = require('./neuron-store');
const SynapseMatrix = require('./synapse-matrix');

const DEFAULT_RATE = 0.1;
const DEFAULT_INIT = 0.2;

/**
 * Hebbian 学习规则
 * "Neurons that fire together, wire together"
 * 
 * 在激活周期结束后调用：记录哪些神经元共同激活，强化它们之间的连接
 */
class HebbianLearner {
  constructor(store, matrix) {
    this.store = store || new NeuronStore();
    this.matrix = matrix || new SynapseMatrix();
  }

  /**
   * 学习本次激活模式
   * @param {string[]} firedIds - 本次激活的神经元ID列表（按激活强度排序）
   * @param {Object} [options]
   * @param {number} [options.rate] - 学习率
   * @param {boolean} [options.updateTimestamps] - 是否更新激活时间戳
   * @returns {{ strengthened: number, created: number }}
   */
  learn(firedIds, options = {}) {
    const rate = options.rate || DEFAULT_RATE;
    if (firedIds.length < 2) {
      return { strengthened: 0, created: 0 };
    }

    let strengthened = 0;
    let created = 0;

    // 对每一对共同激活的神经元强化连接
    for (let i = 0; i < firedIds.length; i++) {
      for (let j = i + 1; j < firedIds.length; j++) {
        const a = firedIds[i];
        const b = firedIds[j];

        const existingWeight = this.matrix.getWeight(a, b);
        if (existingWeight > 0) {
          // 已有连接 → 强化
          this.matrix.strengthen(a, b, rate);
          strengthened++;
        } else {
          // 无连接 → 建立初始弱连接
          this.matrix.connect(a, b, DEFAULT_INIT);
          this.matrix.connect(b, a, DEFAULT_INIT);
          created++;
        }
      }
    }

    // 更新激活次数（如果尚未被 activation-engine 更新）
    if (options.updateTimestamps) {
      const now = new Date().toISOString();
      for (const id of firedIds) {
        const n = this.store.get(id);
        if (n) {
          n.activationCount = (n.activationCount || 0) + 1;
          n.lastActivated = now;
          this.store.update(id, { activationCount: n.activationCount, lastActivated: n.lastActivated });
        }
      }
    }

    return { strengthened, created };
  }
}

module.exports = HebbianLearner;
