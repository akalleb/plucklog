# Config package for ALMOX-SMS
# This file makes the config directory a Python package

import os
from pathlib import Path
from dotenv import load_dotenv

# Sempre carregar o .env da raiz do projeto para evitar confusão com diretórios duplicados
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / '.env')

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # Configuração de banco de dados MongoDB (persistência oficial)
    MONGO_URI = os.environ.get('MONGO_URI') or 'mongodb://localhost:27017/almox_sms'
    MONGO_DB = os.environ.get('MONGO_DB') or 'almox_sms'
    
    # Configurações da aplicação
    ITEMS_PER_PAGE = 20
    
    # Configurações de segurança
    SESSION_COOKIE_SECURE = False  # True em produção com HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Configurações de sessão
    PERMANENT_SESSION_LIFETIME = 3600  # 1 hora em segundos
    
    # Configurações de cookies de lembrar
    REMEMBER_COOKIE_DURATION = 86400 * 7  # 7 dias em segundos
    REMEMBER_COOKIE_SECURE = False  # True em produção com HTTPS
    REMEMBER_COOKIE_HTTPONLY = True

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False
    
    # Configurações de segurança para produção
    SESSION_COOKIE_SECURE = True  # Requer HTTPS
    REMEMBER_COOKIE_SECURE = True  # Requer HTTPS

class TestingConfig(Config):
    TESTING = True

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
