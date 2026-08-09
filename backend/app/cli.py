import click


def register_cli(app):
    @app.cli.command("seed")
    def seed_command():
        """Popula o banco com categorias padrao e o usuario de demonstracao junior@gmail.com."""
        from app.seed import seed_demo_user

        user = seed_demo_user()
        click.echo(f"Seed concluido. Usuario: {user.email} / senha: 123456")
