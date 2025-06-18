FROM python:3.11

WORKDIR /bot

COPY . .

RUN pip install -r requirements.txt

CMD ["python", "main.py"]
