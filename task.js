const schedule = require('node-schedule');

const { printSync } = require('./tasks/print');

module.exports = {
  initTask: async () => {
    await printSync();

    const ruleForMinute = new schedule.RecurrenceRule();
    ruleForMinute.minute = [0];

    schedule.scheduleJob(ruleForMinute, async () => {
        await printSync();
    });
  }
}