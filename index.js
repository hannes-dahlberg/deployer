let yaml = require('js-yaml');
let fs = require('fs');
let node_ssh = require('node-ssh');
let args = require('args');

args
  .option('port', 'The port on which the app will be running', 3000)
  .option('reload', 'Enable/disable livereloading')
  .command('serve', 'Serve your static site', ['s'])

const flags = args.parse(process.argv)
console.log(flags)

var doc = yaml.safeLoad(fs.readFileSync('./deployer.yml', 'utf8'));
