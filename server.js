const bootstrap = () => require('./dist/main').bootstrap();

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { bootstrap };
